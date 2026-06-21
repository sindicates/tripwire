"""
test_uagent_researcher.py — Unit tests for the uAgent research components.

Tests cover:
  - ResearchRequest / ResearchResponse message model serialization
  - ResearchResponse.from_bundle() and .to_bundle() round-trip
  - ResearchResponse.error() factory
  - _parse_bundle() with various Claude output formats
  - _run_research() with mocked Claude and tool calls
  - UAgentClient with mocked httpx responses (success, error, timeout)
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.research_agent import ResearchBundle
from app.services.uagent_researcher import (
    ResearchRequest,
    ResearchResponse,
    _parse_bundle,
    _run_research,
)
from app.services.uagent_client import UAgentClient


# ---------------------------------------------------------------------------
# Message model tests
# ---------------------------------------------------------------------------

class TestResearchRequest:
    """Tests for the ResearchRequest uAgent message model."""

    def test_create_with_all_fields(self):
        req = ResearchRequest(
            risk_type="academic_probation",
            school_name="Yale University",
            student_snapshot={"gpa": 1.99, "major": "CS"},
            seed_urls=["https://finaid.yale.edu/policies"],
        )
        assert req.risk_type == "academic_probation"
        assert req.school_name == "Yale University"
        assert req.student_snapshot == {"gpa": 1.99, "major": "CS"}
        assert req.seed_urls == ["https://finaid.yale.edu/policies"]

    def test_create_with_defaults(self):
        req = ResearchRequest(
            risk_type="gpa_drop",
            school_name="UC Berkeley",
            student_snapshot={"gpa": 2.1},
        )
        assert req.seed_urls == []

    def test_serialization_round_trip(self):
        req = ResearchRequest(
            risk_type="aid_risk",
            school_name="Penn",
            student_snapshot={"gpa": 1.8, "credits_completed": 45},
            seed_urls=["https://sfs.upenn.edu/sap"],
        )
        data = req.model_dump()
        restored = ResearchRequest(**data)
        assert restored.risk_type == req.risk_type
        assert restored.student_snapshot == req.student_snapshot


class TestResearchResponse:
    """Tests for the ResearchResponse uAgent message model."""

    def test_from_bundle(self):
        bundle = ResearchBundle(
            appeal_process_text="Submit the SAP appeal form...",
            form_names=["SAP Appeal Form"],
            key_deadlines=[{"name": "SAP Appeal", "date_text": "2024-08-15"}],
            contact_info={"email": "finaid@yale.edu", "phone": "203-432-2700"},
            policy_excerpts=["Students must maintain a 2.0 GPA..."],
            visited_urls=["https://finaid.yale.edu/policies/sap"],
        )
        resp = ResearchResponse.from_bundle(bundle)
        assert resp.status == "ok"
        assert resp.form_names == ["SAP Appeal Form"]
        assert resp.contact_info == {"email": "finaid@yale.edu", "phone": "203-432-2700"}
        assert resp.error_message is None

    def test_to_bundle_round_trip(self):
        bundle = ResearchBundle(
            appeal_process_text="Appeal process text",
            form_names=["Form A", "Form B"],
            key_deadlines=[],
            contact_info={"email": "test@edu"},
            policy_excerpts=["excerpt"],
            visited_urls=["https://example.edu"],
        )
        resp = ResearchResponse.from_bundle(bundle)
        restored = resp.to_bundle()
        assert restored.appeal_process_text == bundle.appeal_process_text
        assert restored.form_names == bundle.form_names
        assert restored.contact_info == bundle.contact_info

    def test_error_factory(self):
        resp = ResearchResponse.error("Tavily rate limited")
        assert resp.status == "error"
        assert resp.error_message == "Tavily rate limited"
        assert resp.form_names == []
        assert resp.visited_urls == []

    def test_serialization_round_trip(self):
        resp = ResearchResponse(
            status="ok",
            form_names=["SAP Appeal"],
            key_deadlines=[{"name": "deadline", "date_text": "2024-07-01"}],
            contact_info={"email": "test@edu"},
        )
        data = resp.model_dump()
        restored = ResearchResponse(**data)
        assert restored.status == "ok"
        assert restored.form_names == ["SAP Appeal"]


# ---------------------------------------------------------------------------
# Bundle parsing tests
# ---------------------------------------------------------------------------

class TestParseBundleUAgent:
    """Tests for _parse_bundle() — handles various Claude output formats."""

    def test_clean_json(self):
        raw = json.dumps({
            "appeal_process_text": "Submit appeal within 15 days",
            "form_names": ["SAP Appeal Form"],
            "key_deadlines": [{"name": "SAP Appeal", "date_text": "2024-08-15"}],
            "contact_info": {"email": "finaid@yale.edu"},
            "policy_excerpts": ["Must maintain 2.0 GPA"],
            "visited_urls": ["https://finaid.yale.edu/sap"],
        })
        bundle = _parse_bundle(raw)
        assert bundle.form_names == ["SAP Appeal Form"]
        assert bundle.contact_info == {"email": "finaid@yale.edu"}

    def test_json_in_code_fence(self):
        raw = '```json\n{"form_names": ["Appeal Form"], "visited_urls": []}\n```'
        bundle = _parse_bundle(raw)
        assert bundle.form_names == ["Appeal Form"]

    def test_json_with_surrounding_prose(self):
        raw = (
            "Here is the research bundle:\n\n"
            '{"form_names": ["SAP Form"], "contact_info": {"email": "aid@edu"}, "visited_urls": ["https://edu"]}\n\n'
            "Let me know if you need anything else."
        )
        bundle = _parse_bundle(raw)
        assert bundle.form_names == ["SAP Form"]

    def test_unparseable_returns_empty(self):
        raw = "This is not JSON at all, just plain text with no braces"
        bundle = _parse_bundle(raw)
        assert bundle.form_names == []
        assert bundle.visited_urls == []

    def test_null_fields_handled(self):
        raw = json.dumps({
            "appeal_process_text": None,
            "form_names": None,
            "key_deadlines": None,
            "contact_info": None,
            "policy_excerpts": None,
            "visited_urls": None,
        })
        bundle = _parse_bundle(raw)
        assert bundle.appeal_process_text is None
        assert bundle.form_names == []
        assert bundle.visited_urls == []


# ---------------------------------------------------------------------------
# UAgentClient tests (mocked HTTP)
# ---------------------------------------------------------------------------

class TestUAgentClient:
    """Tests for UAgentClient — HTTP communication with the uAgent."""

    @pytest.mark.asyncio
    async def test_successful_research(self):
        """Client correctly deserializes a successful uAgent response."""
        mock_response_data = {
            "status": "ok",
            "appeal_process_text": "Submit SAP appeal",
            "form_names": ["SAP Appeal Form"],
            "key_deadlines": [{"name": "Appeal", "date_text": "2024-08-15"}],
            "contact_info": {"email": "finaid@yale.edu", "phone": "203-432-2700"},
            "policy_excerpts": ["Students must maintain 2.0 GPA"],
            "visited_urls": ["https://finaid.yale.edu/sap"],
        }

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_response_data
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.services.uagent_client.httpx.AsyncClient", return_value=mock_client):
            client = UAgentClient(base_url="http://localhost:8001")
            bundle = await client.research(
                risk_type="academic_probation",
                school_name="Yale University",
                student_snapshot={"gpa": 1.99},
            )

        assert bundle.form_names == ["SAP Appeal Form"]
        assert bundle.contact_info["email"] == "finaid@yale.edu"
        assert len(bundle.visited_urls) == 1

    @pytest.mark.asyncio
    async def test_error_response_raises(self):
        """Client raises ValueError when uAgent returns error status."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": "error",
            "error_message": "Anthropic API key missing",
        }
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("app.services.uagent_client.httpx.AsyncClient", return_value=mock_client):
            client = UAgentClient(base_url="http://localhost:8001")
            with pytest.raises(ValueError, match="Anthropic API key missing"):
                await client.research(
                    risk_type="gpa_drop",
                    school_name="Berkeley",
                    student_snapshot={"gpa": 2.1},
                )

    @pytest.mark.asyncio
    async def test_connection_error_propagates(self):
        """Client lets httpx.ConnectError propagate so caller can fall back."""
        import httpx

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))

        with patch("app.services.uagent_client.httpx.AsyncClient", return_value=mock_client):
            client = UAgentClient(base_url="http://localhost:8001")
            with pytest.raises(httpx.ConnectError):
                await client.research(
                    risk_type="aid_risk",
                    school_name="Penn",
                    student_snapshot={"gpa": 1.5},
                )


# ---------------------------------------------------------------------------
# _run_research tests (mocked Claude)
# ---------------------------------------------------------------------------

class TestRunResearch:
    """Tests for _run_research() — the Claude tool-use loop inside the uAgent."""

    @pytest.mark.asyncio
    async def test_direct_text_response(self):
        """Claude returns bundle JSON immediately (no tool calls)."""
        bundle_json = json.dumps({
            "appeal_process_text": "File an appeal",
            "form_names": ["SAP Appeal"],
            "key_deadlines": [],
            "contact_info": {"email": "aid@school.edu"},
            "policy_excerpts": ["Policy text"],
            "visited_urls": ["https://school.edu/sap"],
        })

        mock_text_block = MagicMock()
        mock_text_block.type = "text"
        mock_text_block.text = bundle_json

        mock_response = MagicMock()
        mock_response.stop_reason = "end_turn"
        mock_response.content = [mock_text_block]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        with patch("app.services.uagent_researcher.anthropic.AsyncAnthropic", return_value=mock_client):
            bundle = await _run_research(
                risk_type="academic_probation",
                school_name="Test University",
                student_snapshot={"gpa": 1.8},
                seed_urls=[],
            )

        assert bundle.form_names == ["SAP Appeal"]
        assert bundle.contact_info["email"] == "aid@school.edu"

    @pytest.mark.asyncio
    async def test_exception_returns_empty_bundle(self):
        """On exception, returns empty bundle instead of crashing."""
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(
            side_effect=Exception("API error")
        )

        with patch("app.services.uagent_researcher.anthropic.AsyncAnthropic", return_value=mock_client):
            bundle = await _run_research(
                risk_type="gpa_drop",
                school_name="Test U",
                student_snapshot={"gpa": 2.0},
                seed_urls=[],
            )

        assert bundle.form_names == []
        assert bundle.visited_urls == []
