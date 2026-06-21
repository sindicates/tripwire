"""
uagent_client.py — Thin async client for sending research requests to the uAgent.

Called by risk_engine.build_action_packet() to delegate research to the
Fetch.ai uAgent process. If the agent is unreachable or times out, raises
an exception so the caller can fall back to direct ResearchAgent.

Communication uses the uAgent's REST POST endpoint (simple HTTP), not
agent-to-agent messaging — this avoids requiring the FastAPI backend to
run its own uAgent instance.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.services.research_agent import ResearchBundle

logger = logging.getLogger(__name__)


class UAgentClient:
    """Sends research requests to the Sherpa uAgent via its REST endpoint."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: int | None = None,
    ) -> None:
        port = settings.UAGENT_PORT
        self._base_url = base_url or f"http://localhost:{port}"
        self._timeout = timeout or settings.UAGENT_TIMEOUT

    async def research(
        self,
        risk_type: str,
        school_name: str,
        student_snapshot: dict,
        seed_urls: list[str] | None = None,
    ) -> ResearchBundle:
        """
        Send a research request to the uAgent and return the ResearchBundle.

        Raises:
            httpx.ConnectError: If the uAgent process is not running
            httpx.TimeoutException: If the research takes longer than timeout
            ValueError: If the uAgent returns an error status
        """
        payload = {
            "risk_type": risk_type,
            "school_name": school_name,
            "student_snapshot": student_snapshot,
            "seed_urls": seed_urls or [],
        }

        logger.info(
            "UAgentClient sending request: risk_type=%s school=%s",
            risk_type, school_name,
        )

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/rest/research",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        if data.get("status") == "error":
            error_msg = data.get("error_message", "Unknown uAgent error")
            logger.error("UAgentClient received error response: %s", error_msg)
            raise ValueError(f"uAgent research error: {error_msg}")

        bundle = ResearchBundle(
            appeal_process_text=data.get("appeal_process_text"),
            form_names=data.get("form_names") or [],
            key_deadlines=data.get("key_deadlines") or [],
            contact_info=data.get("contact_info") or {},
            policy_excerpts=data.get("policy_excerpts") or [],
            visited_urls=data.get("visited_urls") or [],
        )

        logger.info(
            "UAgentClient received bundle: forms=%s deadlines=%d urls=%d",
            bundle.form_names,
            len(bundle.key_deadlines),
            len(bundle.visited_urls),
        )

        return bundle
