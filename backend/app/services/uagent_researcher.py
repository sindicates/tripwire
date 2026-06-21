"""
uagent_researcher.py — Fetch.ai uAgent that performs autonomous web research.

This is a standalone agent process that listens for ResearchRequest messages
(via REST POST and uAgent protocol) and returns a ResearchResponse containing
a structured ResearchBundle.

It reuses the existing tool layer (web_researcher.py) for Tavily search and
httpx page fetching, and the same Claude tool-use loop logic from
research_agent.py — but wrapped in a Fetch.ai uAgent runtime.

Start with:
    cd backend && python -m scripts.run_research_agent
"""
from __future__ import annotations

import json
import logging
import re
import traceback
from dataclasses import asdict

from uagents import Agent, Context, Model, Field

import anthropic

from app.config import settings
from app.services.research_agent import (
    ResearchBundle,
    RESEARCH_TOOLS,
    _build_research_task,
    _RESEARCH_SYSTEM,
    _MAX_ITERATIONS,
    _FORCE_FINAL_AT,
)
from app.services.web_researcher import execute_tool

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# Message models (uAgents protocol)
# ---------------------------------------------------------------------------

class StudentSnapshot(Model):
    gpa: float | None = None
    credits_completed: int | None = None
    credits_required: int | None = None
    major: str | None = None
    aid_package: dict | None = None


class ResearchRequest(Model):
    """Sent by the FastAPI backend to trigger research."""
    risk_type: str = Field(description="Type of academic risk, e.g. 'academic_probation'")
    school_name: str = Field(description="Institution name, e.g. 'Yale University'")
    student_snapshot: dict = Field(description="Student academic data snapshot")
    seed_urls: list[str] = Field(default=[], description="Seed URLs from RAG chunks")


class ResearchResponse(Model):
    """Returned by the uAgent with research results."""
    status: str = Field(description="'ok' or 'error'")
    appeal_process_text: str | None = None
    form_names: list[str] = Field(default=[])
    key_deadlines: list[dict] = Field(default=[])
    contact_info: dict = Field(default={})
    policy_excerpts: list[str] = Field(default=[])
    visited_urls: list[str] = Field(default=[])
    error_message: str | None = None

    @classmethod
    def from_bundle(cls, bundle: ResearchBundle) -> "ResearchResponse":
        return cls(
            status="ok",
            appeal_process_text=bundle.appeal_process_text,
            form_names=bundle.form_names,
            key_deadlines=bundle.key_deadlines,
            contact_info=bundle.contact_info,
            policy_excerpts=bundle.policy_excerpts,
            visited_urls=bundle.visited_urls,
        )

    @classmethod
    def error(cls, message: str) -> "ResearchResponse":
        return cls(status="error", error_message=message)

    def to_bundle(self) -> ResearchBundle:
        return ResearchBundle(
            appeal_process_text=self.appeal_process_text,
            form_names=self.form_names,
            key_deadlines=self.key_deadlines,
            contact_info=self.contact_info,
            policy_excerpts=self.policy_excerpts,
            visited_urls=self.visited_urls,
        )


# ---------------------------------------------------------------------------
# Core research logic (async, reuses existing tools)
# ---------------------------------------------------------------------------

async def _run_research(
    risk_type: str,
    school_name: str,
    student_snapshot: dict,
    seed_urls: list[str],
) -> ResearchBundle:
    """
    Run the Claude tool-use research loop.

    This is the same logic as ResearchAgent.research() in research_agent.py,
    extracted so it can be called from the uAgent handler without instantiating
    the ResearchAgent class.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    task = _build_research_task(risk_type, school_name, student_snapshot, seed_urls)
    messages: list[dict] = [{"role": "user", "content": task}]

    try:
        for iteration in range(_MAX_ITERATIONS):
            is_final = iteration >= _FORCE_FINAL_AT
            logger.info(
                "uAgent research iteration=%d risk_type=%s is_final=%s",
                iteration, risk_type, is_final,
            )

            create_kwargs: dict = dict(
                model=CLAUDE_MODEL,
                max_tokens=4096,
                system=_RESEARCH_SYSTEM,
                messages=messages,
            )
            if not is_final:
                create_kwargs["tools"] = RESEARCH_TOOLS

            response = await client.messages.create(**create_kwargs)
            logger.info(
                "uAgent research stop_reason=%s content_types=%s",
                response.stop_reason,
                [b.type for b in response.content],
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                text_block = next(
                    (b for b in response.content if b.type == "text"), None
                )
                if text_block:
                    return _parse_bundle(text_block.text)
                logger.warning(
                    "uAgent research end_turn with no text block at iteration=%d",
                    iteration,
                )
                break

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        logger.info(
                            "uAgent research tool_call name=%s input=%s",
                            block.name, block.input,
                        )
                        result_str = await execute_tool(block.name, block.input)
                        logger.info(
                            "uAgent research tool_result name=%s preview=%r",
                            block.name,
                            result_str[:200] if result_str else "",
                        )
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_str,
                        })
                messages.append({"role": "user", "content": tool_results})
            else:
                logger.warning(
                    "uAgent research unexpected stop_reason=%s at iteration=%d",
                    response.stop_reason, iteration,
                )
                break

    except Exception:
        logger.error(
            "uAgent research exception for risk_type=%s:\n%s",
            risk_type, traceback.format_exc(),
        )

    return ResearchBundle.empty()


def _parse_bundle(raw: str) -> ResearchBundle:
    """Parse Claude's text output into a ResearchBundle."""
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return ResearchBundle.from_dict(json.loads(text))
    except json.JSONDecodeError:
        pass

    outer = re.search(r"\{[\s\S]*\}", text)
    if outer:
        try:
            return ResearchBundle.from_dict(json.loads(outer.group()))
        except json.JSONDecodeError:
            pass

    logger.warning("uAgent could not parse bundle JSON; returning empty bundle")
    return ResearchBundle.empty()


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def create_research_agent(
    seed: str | None = None,
    port: int | None = None,
    endpoint: str | None = None,
) -> Agent:
    """
    Create and configure the Fetch.ai research uAgent.

    The agent exposes two interfaces:
      1. REST POST at /rest/research — for external HTTP callers (the FastAPI backend)
      2. uAgent on_message(ResearchRequest) — for agent-to-agent communication
    """
    _seed = seed or settings.UAGENT_SEED
    _port = port or settings.UAGENT_PORT
    _endpoint = endpoint or settings.UAGENT_ENDPOINT

    agent = Agent(
        name="sherpa_research_agent",
        seed=_seed,
        port=_port,
        endpoint=[_endpoint],
    )

    # --- REST POST endpoint (called by FastAPI backend via httpx) ---

    @agent.on_rest_post("/rest/research", ResearchRequest, ResearchResponse)
    async def handle_rest_research(ctx: Context, req: ResearchRequest) -> ResearchResponse:
        ctx.logger.info(
            "REST research request: risk_type=%s school=%s",
            req.risk_type, req.school_name,
        )
        try:
            bundle = await _run_research(
                risk_type=req.risk_type,
                school_name=req.school_name,
                student_snapshot=req.student_snapshot,
                seed_urls=req.seed_urls,
            )
            response = ResearchResponse.from_bundle(bundle)
            ctx.logger.info(
                "REST research complete: forms=%s deadlines=%d urls=%d",
                response.form_names,
                len(response.key_deadlines),
                len(response.visited_urls),
            )
            return response
        except Exception as exc:
            ctx.logger.error("REST research failed: %s", traceback.format_exc())
            return ResearchResponse.error(str(exc))

    # --- Agent protocol endpoint (agent-to-agent messaging) ---

    @agent.on_message(model=ResearchRequest)
    async def handle_agent_research(ctx: Context, sender: str, msg: ResearchRequest):
        ctx.logger.info(
            "Agent research request from %s: risk_type=%s school=%s",
            sender, msg.risk_type, msg.school_name,
        )
        try:
            bundle = await _run_research(
                risk_type=msg.risk_type,
                school_name=msg.school_name,
                student_snapshot=msg.student_snapshot,
                seed_urls=msg.seed_urls,
            )
            response = ResearchResponse.from_bundle(bundle)
        except Exception as exc:
            ctx.logger.error("Agent research failed: %s", traceback.format_exc())
            response = ResearchResponse.error(str(exc))

        await ctx.send(sender, response)

    @agent.on_event("startup")
    async def on_startup(ctx: Context):
        ctx.logger.info("Sherpa Research Agent started")
        ctx.logger.info("Agent address: %s", ctx.agent.address)
        ctx.logger.info("REST endpoint: http://localhost:%d/rest/research", _port)

    return agent
