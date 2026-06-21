"""
Sherpa Research Agent — Agentverse hosted agent.

Paste the ENTIRE contents of this file into the Agentverse code editor for the
agent at: agent1qtfu9wcgnfrv7qufg0ce6yufg9g2zhj50743z5a6ctk4kwezx8u7z4qr60k

Required environment variables (set in the Agentverse agent's Secrets panel):
  ANTHROPIC_API_KEY   — your Anthropic API key
  TAVILY_API_KEY      — your Tavily search API key (optional; agent uses fetch_page only if unset)

This agent receives ResearchRequest messages from the Sherpa FastAPI backend,
runs a Claude tool-use research loop (web search + page fetch), and replies with
a ResearchResponse containing structured policy/deadline/contact info.
"""

import json
import logging
import re
import traceback
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from uagents import Agent, Context, Field, Model

# ---------------------------------------------------------------------------
# Message models  ← MUST match uagent_researcher.py exactly (digest must match)
# ---------------------------------------------------------------------------

class ResearchRequest(Model):
    risk_type: str = Field(description="Type of academic risk, e.g. 'academic_probation'")
    school_name: str = Field(description="Institution name, e.g. 'Yale University'")
    student_snapshot: dict = Field(description="Student academic data snapshot")
    seed_urls: list[str] = Field(default=[], description="Seed URLs from RAG chunks")


class ResearchResponse(Model):
    status: str = Field(description="'ok' or 'error'")
    appeal_process_text: str | None = None
    form_names: list[str] = Field(default=[])
    key_deadlines: list[dict] = Field(default=[])
    contact_info: dict = Field(default={})
    policy_excerpts: list[str] = Field(default=[])
    visited_urls: list[str] = Field(default=[])
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Config — hardcoded for Agentverse (no env var support)
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY: str = "PASTE_YOUR_ANTHROPIC_KEY_HERE"
TAVILY_API_KEY: str = "PASTE_YOUR_TAVILY_KEY_HERE"
CLAUDE_MODEL = "claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Web tools
# ---------------------------------------------------------------------------

_TAVILY_API = "https://api.tavily.com/search"
_MAX_PAGE_CHARS = 12_000
_MAX_LINKS = 40


async def search_web(query: str) -> str:
    if not TAVILY_API_KEY:
        return (
            "Search is unavailable: TAVILY_API_KEY is not configured. "
            "Use fetch_page instead, starting from seed URLs."
        )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _TAVILY_API,
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": 5,
                    "search_depth": "basic",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = [
                {"title": r.get("title", ""), "url": r["url"], "snippet": r.get("content", "")}
                for r in data.get("results", [])
            ]
            return json.dumps(results)
    except Exception as exc:
        return json.dumps({"error": f"Search failed: {exc}"})


async def fetch_page(url: str) -> str:
    if not url.startswith("https://"):
        return f"Error: Only HTTPS URLs are permitted. Received: {url!r}"
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, max_redirects=5) as client:
            resp = await client.get(url, headers={"User-Agent": "Sherpa-Advisor-Bot/1.0"})
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        seen: set[str] = set()
        links: list[str] = []
        for a in soup.find_all("a", href=True):
            href: str = a["href"].strip()
            if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            if href.startswith("/"):
                display = href
            elif href.startswith("https://") or href.startswith("http://"):
                if urlparse(href).netloc != urlparse(url).netloc:
                    continue
                display = href
            else:
                display = urljoin(url, href)
            if display not in seen:
                seen.add(display)
                links.append(display)
            if len(links) >= _MAX_LINKS:
                break
        for tag in soup(["nav", "footer", "script", "style", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        if len(text) > _MAX_PAGE_CHARS:
            text = text[:_MAX_PAGE_CHARS] + "\n\n[Content truncated]"
        if links:
            text += "\n\nLinks on this page:\n" + "\n".join(links)
        return text or "(Empty page)"
    except httpx.HTTPStatusError as exc:
        return f"Error: HTTP {exc.response.status_code} for {url}"
    except Exception as exc:
        return f"Error fetching {url}: {exc}"


async def execute_tool(name: str, inputs: dict) -> str:
    if name == "search_web":
        return await search_web(inputs.get("query", ""))
    if name == "fetch_page":
        return await fetch_page(inputs.get("url", ""))
    return f"Error: Unknown tool '{name}'"


# ---------------------------------------------------------------------------
# Research logic (Claude tool-use loop)
# ---------------------------------------------------------------------------

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
    "3. When you have gathered enough facts, output ONLY a valid JSON object matching "
    "the ResearchBundle schema below. No prose before or after — just the JSON.\n\n"
    f"ResearchBundle schema:\n{_BUNDLE_SCHEMA}\n\n"
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
            "properties": {"query": {"type": "string", "description": "Specific search query"}},
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
            "properties": {"url": {"type": "string", "description": "Full HTTPS URL to fetch"}},
            "required": ["url"],
        },
    },
]

_MAX_ITERATIONS = 6
_FORCE_FINAL_AT = 4


def _build_research_task(
    risk_type: str, school_name: str, student_snapshot: dict, seed_urls: list[str]
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
        "When you have gathered the information above, output the ResearchBundle JSON. "
        "Do NOT synthesize or advise — just return what you found."
    )


def _parse_bundle(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    outer = re.search(r"\{[\s\S]*\}", text)
    if outer:
        try:
            return json.loads(outer.group())
        except json.JSONDecodeError:
            pass
    return {}


async def run_research(
    risk_type: str,
    school_name: str,
    student_snapshot: dict,
    seed_urls: list[str],
) -> ResearchResponse:
    """Run the Claude tool-use research loop and return a ResearchResponse."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    task = _build_research_task(risk_type, school_name, student_snapshot, seed_urls)
    messages: list[dict] = [{"role": "user", "content": task}]

    try:
        for iteration in range(_MAX_ITERATIONS):
            is_final = iteration >= _FORCE_FINAL_AT
            create_kwargs: dict = dict(
                model=CLAUDE_MODEL,
                max_tokens=4096,
                system=_RESEARCH_SYSTEM,
                messages=messages,
            )
            if not is_final:
                create_kwargs["tools"] = RESEARCH_TOOLS

            response = await client.messages.create(**create_kwargs)
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == "end_turn":
                text_block = next((b for b in response.content if b.type == "text"), None)
                if text_block:
                    data = _parse_bundle(text_block.text)
                    return ResearchResponse(
                        status="ok",
                        appeal_process_text=data.get("appeal_process_text"),
                        form_names=data.get("form_names") or [],
                        key_deadlines=data.get("key_deadlines") or [],
                        contact_info=data.get("contact_info") or {},
                        policy_excerpts=data.get("policy_excerpts") or [],
                        visited_urls=data.get("visited_urls") or [],
                    )
                break

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result_str = await execute_tool(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_str,
                        })
                messages.append({"role": "user", "content": tool_results})

    except Exception as exc:
        return ResearchResponse(status="error", error_message=str(exc))

    return ResearchResponse(status="error", error_message="Research loop exhausted without result")


# ---------------------------------------------------------------------------
# Agent definition
# ---------------------------------------------------------------------------

agent = Agent(name="sherpa_research_agent")


@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info("Sherpa Research Agent started on Agentverse")
    ctx.logger.info(f"Agent address: {ctx.agent.address}")
    ctx.logger.info(f"ANTHROPIC_API_KEY set: {bool(ANTHROPIC_API_KEY)}")
    ctx.logger.info(f"TAVILY_API_KEY set: {bool(TAVILY_API_KEY)}")


@agent.on_message(model=ResearchRequest)
async def handle_research(ctx: Context, sender: str, msg: ResearchRequest):
    ctx.logger.info(f"Research request from {sender}: risk_type={msg.risk_type} school={msg.school_name}")
    response = await run_research(
        risk_type=msg.risk_type,
        school_name=msg.school_name,
        student_snapshot=msg.student_snapshot,
        seed_urls=msg.seed_urls,
    )
    ctx.logger.info(
        f"Research complete: status={response.status} forms={response.form_names} deadlines={len(response.key_deadlines)}"
    )
    await ctx.send(sender, response)


if __name__ == "__main__":
    agent.run()
