"""
research_agent.py — Stage 1 of the two-stage action packet pipeline.

ResearchAgent runs a focused tool-use loop whose ONLY job is to gather facts
about a risk type at a specific school and return them as a structured
ResearchBundle. No synthesis, no advice — just raw research output.

Stage 2 (synthesis) lives in risk_engine._synthesize().
"""
from __future__ import annotations

import json
import logging
import re
import traceback
from dataclasses import dataclass, field

import anthropic

from app.config import settings
from app.services.web_researcher import execute_tool

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-6"

_BUNDLE_SCHEMA = """{
  "appeal_process_text": "Full text excerpt describing the appeal/reinstatement process, or null",
  "form_names": ["Exact form names found, e.g. 'SAP Appeal Form'"],
  "key_deadlines": [
    {
      "name": "Deadline name",
      "description": "What it is for",
      "date_text": "Exact date text from the source, e.g. '2024-08-15' or 'last day of finals week'"
    }
  ],
  "contact_info": {
    "office": "Office name, or null",
    "email": "email@school.edu, or null",
    "phone": "(555) 555-5555, or null"
  },
  "policy_excerpts": ["Relevant quoted passages from policy pages"],
  "visited_urls": ["All URLs you actually fetched with fetch_page"]
}"""

_RESEARCH_SYSTEM = (
    "You are a research assistant. Your ONLY job is to gather factual information "
    "from the web about a specific academic risk situation at a specific school. "
    "Do NOT write advice, action plans, or recommendations — just gather and report facts.\n\n"
    "Process:\n"
    "1. Use search_web and fetch_page to find the information listed in the task.\n"
    "2. Only fetch .edu pages or official institution pages.\n"
    "3. When you have gathered enough facts, you MUST call the submit_research_bundle tool.\n\n"
    "Anti-hallucination rules:\n"
    "- 'visited_urls' must contain only URLs you actually called fetch_page on.\n"
    "- 'form_names' must be exact names found on official pages, not guesses.\n"
    "- 'key_deadlines[].date_text' must be verbatim from the source — never compute or infer dates.\n"
    "- null is always better than an invented value."
)

_RESEARCH_GOALS: dict[str, str] = {
    "gpa_drop": (
        "Find:\n"
        "1. The exact GPA threshold and academic warning / aid floor policy\n"
        "2. Academic recovery resources: tutoring programs, grade replacement policy\n"
        "3. Advisor booking link or contact email to create an academic recovery plan\n"
        "4. Financial aid office email and phone number"
    ),
    "academic_probation": (
        "Find:\n"
        "1. The exact academic probation reinstatement process\n"
        "2. The appeal form name and direct submission URL or physical location\n"
        "3. Required documentation (mitigating circumstances letter, academic plan, etc.)\n"
        "4. The current appeal deadline — the exact date text as written in the policy\n"
        "5. Financial aid office email address and phone number"
    ),
    "satisfactory_academic_progress": (
        "Find:\n"
        "1. The SAP appeal form name and where to download/submit it\n"
        "2. The current SAP appeal deadline — exact date text as written\n"
        "3. Required documentation (mitigating circumstances, academic plan signed by advisor)\n"
        "4. Financial aid office email and phone number\n"
        "5. Whether the student returns to good standing immediately or after a probationary semester"
    ),
    "aid_risk": (
        "Find:\n"
        "1. The combined financial aid appeal process\n"
        "2. The exact appeal form name, submission method, and current deadline\n"
        "3. Required documentation for the appeal\n"
        "4. Financial aid office email and phone number\n"
        "5. Whether aid can be reinstated mid-year or only at the next semester"
    ),
    "enrollment_drop": (
        "Find:\n"
        "1. Whether financial aid requires full-time enrollment and the exact credit minimum\n"
        "2. The add/drop deadline to add courses and return to full-time status\n"
        "3. Registrar contact: email, phone, and the course-add process\n"
        "4. Any enrollment exceptions or half-time aid options"
    ),
    "deadline_miss": (
        "Find:\n"
        "1. The exact form or process required to meet this deadline\n"
        "2. Any late submission process if the deadline has passed\n"
        "3. The responsible office, their email, and phone number"
    ),
}

RESEARCH_TOOLS: list[dict] = [
    {
        "name": "search_web",
        "description": (
            "Search the web for school-specific policy info, forms, deadlines, or office "
            "contact details. Use precise queries like 'Yale SAP appeal form deadline 2024' "
            "or 'Yale financial aid office email address'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Specific search query"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_page",
        "description": (
            "Fetch and read the text content of a URL. Use after search_web to read the "
            "actual page. Only fetch .edu pages or official institution pages."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Full HTTPS URL to fetch"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "submit_research_bundle",
        "description": "Submit the final research facts. Call this ONLY when you have gathered all necessary information.",
        "input_schema": {
            "type": "object",
            "properties": {
                "appeal_process_text": {"type": ["string", "null"], "description": "Full text excerpt describing the appeal/reinstatement process"},
                "form_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Exact form names found, e.g. 'SAP Appeal Form'"
                },
                "key_deadlines": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Deadline name"},
                            "description": {"type": "string", "description": "What it is for"},
                            "date_text": {"type": "string", "description": "Exact date text from the source, e.g. '2024-08-15' or 'last day of finals week'"}
                        },
                        "required": ["name", "description", "date_text"]
                    }
                },
                "contact_info": {
                    "type": "object",
                    "properties": {
                        "office": {"type": ["string", "null"]},
                        "email": {"type": ["string", "null"]},
                        "phone": {"type": ["string", "null"]}
                    }
                },
                "policy_excerpts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Relevant quoted passages from policy pages"
                },
                "visited_urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "All URLs you actually fetched with fetch_page"
                }
            },
            "required": ["form_names", "key_deadlines", "contact_info", "policy_excerpts", "visited_urls"]
        }
    }
]

_MAX_ITERATIONS = 6
_FORCE_FINAL_AT = 4


def _build_research_task(
    risk_type: str,
    school_name: str,
    student_snapshot: dict,
    seed_urls: list[str],
) -> str:
    goals = _RESEARCH_GOALS.get(
        risk_type,
        f"Research the implications of {risk_type.replace('_', ' ')} and the required response process.",
    )
    snapshot_lines = "\n".join(
        f"  {k.replace('_', ' ').title()}: {v}"
        for k, v in student_snapshot.items()
        if v is not None
    )
    seed_section = ""
    if seed_urls:
        seed_section = "\nSeed URLs from our policy database (start here):\n" + "\n".join(
            f"  - {u}" for u in seed_urls
        ) + "\n"

    return (
        f"Research task: {risk_type.replace('_', ' ').upper()} at {school_name}\n\n"
        f"Student context (for understanding what to look for):\n{snapshot_lines}\n"
        f"{seed_section}\n"
        f"{goals}\n\n"
        "When you have gathered the information above, call the submit_research_bundle tool. "
        "Do NOT synthesize or advise — just return what you found via the tool."
    )


@dataclass
class ResearchBundle:
    appeal_process_text: str | None = None
    form_names: list[str] = field(default_factory=list)
    key_deadlines: list[dict] = field(default_factory=list)
    contact_info: dict = field(default_factory=dict)
    policy_excerpts: list[str] = field(default_factory=list)
    visited_urls: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "ResearchBundle":
        return cls(
            appeal_process_text=data.get("appeal_process_text"),
            form_names=data.get("form_names") or [],
            key_deadlines=data.get("key_deadlines") or [],
            contact_info=data.get("contact_info") or {},
            policy_excerpts=data.get("policy_excerpts") or [],
            visited_urls=data.get("visited_urls") or [],
        )

    @classmethod
    def empty(cls) -> "ResearchBundle":
        return cls()


class ResearchAgent:
    """Runs a focused web-research loop and returns a structured ResearchBundle."""

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    @classmethod
    async def knowledge_bundle(
        cls,
        risk_type: str,
        school_name: str,
        student_snapshot: dict,
    ) -> ResearchBundle:
        """Single Claude call using training knowledge when web research fails or is unavailable."""
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        goals = _RESEARCH_GOALS.get(
            risk_type,
            f"Research the {risk_type.replace('_', ' ')} process and required response steps.",
        )
        snapshot_lines = "\n".join(
            f"  {k.replace('_', ' ').title()}: {v}"
            for k, v in student_snapshot.items()
            if v is not None
        )

        user_message = (
            f"Task: Fill out a research bundle for {risk_type.replace('_', ' ').upper()} "
            f"at {school_name}.\n\n"
            f"Student context:\n{snapshot_lines}\n\n"
            f"Research goals:\n{goals}\n\n"
            f"Using your training knowledge of {school_name}'s policies, fill in as much of "
            f"the following bundle as you can. Use null for anything you are not confident about.\n\n"
            f"Return ONLY valid JSON matching this schema:\n{_BUNDLE_SCHEMA}"
        )

        try:
            response = await client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=2048,
                system=(
                    "You are a university policy research assistant with expert knowledge of US "
                    "university financial aid and academic standing policies. Return factual "
                    "information about the requested school's policies as JSON. Use null for any "
                    "field you cannot fill confidently. Output ONLY valid JSON — no prose before or after."
                ),
                messages=[{"role": "user", "content": user_message}],
            )
            text_block = next((b for b in response.content if b.type == "text"), None)
            if text_block:
                raw = text_block.text.strip()
                m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
                data = json.loads(m.group(1) if m else raw)
                return ResearchBundle.from_dict(data)
        except Exception:
            logger.warning(
                "knowledge_bundle failed for risk_type=%s:\n%s",
                risk_type, traceback.format_exc(),
            )
        return ResearchBundle.empty()

    async def research(
        self,
        risk_type: str,
        school_name: str,
        student_snapshot: dict,
        seed_urls: list[str] | None = None,
    ) -> ResearchBundle:
        task = _build_research_task(risk_type, school_name, student_snapshot, seed_urls or [])
        messages: list[dict] = [{"role": "user", "content": task}]

        try:
            for iteration in range(_MAX_ITERATIONS):
                is_final = iteration >= _FORCE_FINAL_AT
                logger.info(
                    "ResearchAgent iteration=%d risk_type=%s is_final=%s",
                    iteration, risk_type, is_final,
                )

                create_kwargs: dict = dict(
                    model=CLAUDE_MODEL,
                    max_tokens=4096,
                    system=_RESEARCH_SYSTEM,
                    messages=messages,
                    tools=RESEARCH_TOOLS,
                )

                if is_final:
                    create_kwargs["tool_choice"] = {"type": "tool", "name": "submit_research_bundle"}

                response = await self._client.messages.create(**create_kwargs)
                logger.info(
                    "ResearchAgent stop_reason=%s content_types=%s",
                    response.stop_reason,
                    [b.type for b in response.content],
                )
                messages.append({"role": "assistant", "content": response.content})

                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            if block.name == "submit_research_bundle":
                                logger.info("ResearchAgent submitted bundle.")
                                return ResearchBundle.from_dict(block.input)

                            logger.info(
                                "ResearchAgent tool_call name=%s input=%s",
                                block.name, block.input,
                            )
                            result_str = await execute_tool(block.name, block.input)
                            logger.info(
                                "ResearchAgent tool_result name=%s preview=%r",
                                block.name,
                                result_str[:200] if result_str else "",
                            )
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result_str,
                            })
                    messages.append({"role": "user", "content": tool_results})
                elif response.stop_reason == "end_turn":
                    # Model stopped without submitting the bundle. Prompt it to do so.
                    messages.append({
                        "role": "user",
                        "content": "You stopped without calling submit_research_bundle. Please call the tool with your findings."
                    })
                else:
                    logger.warning(
                        "ResearchAgent unexpected stop_reason=%s at iteration=%d",
                        response.stop_reason, iteration,
                    )
                    break

        except Exception:
            logger.error(
                "ResearchAgent exception for risk_type=%s:\n%s",
                risk_type, traceback.format_exc(),
            )

        logger.info(
            "ResearchAgent web research exhausted, falling back to knowledge_bundle for risk_type=%s",
            risk_type,
        )
        return await ResearchAgent.knowledge_bundle(risk_type, school_name, student_snapshot)


