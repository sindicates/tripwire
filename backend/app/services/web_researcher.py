"""
web_researcher.py — Tool execution layer for the agentic build_action_packet loop.

Two tools available to Claude during research:
  search_web(query) → JSON string list of {title, url, snippet}
  fetch_page(url)   → cleaned page text + "Links on this page:" section
"""
from __future__ import annotations

import json
import logging
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import settings

logger = logging.getLogger(__name__)

_TAVILY_API = "https://api.tavily.com/search"
_MAX_PAGE_CHARS = 12_000  # ~3000 tokens at ~4 chars/token
_MAX_LINKS = 40


async def search_web(query: str) -> str:
    """Search Tavily for policy info, forms, contacts. Returns JSON string."""
    if not settings.TAVILY_API_KEY:
        logger.warning("search_web: TAVILY_API_KEY is not set")
        return (
            "Search is unavailable: TAVILY_API_KEY is not configured. "
            "Do not retry search_web — it will keep returning this error. "
            "Use fetch_page instead, starting from seed URLs and following links in the 'Links on this page' sections."
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _TAVILY_API,
                json={
                    "api_key": settings.TAVILY_API_KEY,
                    "query": query,
                    "max_results": 5,
                    "search_depth": "basic",
                },
            )
            logger.info(
                "search_web status=%d query=%r body_preview=%r",
                resp.status_code,
                query,
                resp.text[:500],
            )
            resp.raise_for_status()
            data = resp.json()
            results = [
                {
                    "title": r.get("title", ""),
                    "url": r["url"],
                    "snippet": r.get("content", ""),
                }
                for r in data.get("results", [])
            ]
            logger.info("search_web returned %d results for query=%r", len(results), query)
            return json.dumps(results)
    except Exception as exc:
        logger.error("search_web failed for query=%r: %s", query, exc, exc_info=True)
        return json.dumps({"error": f"Search failed: {exc}"})


async def fetch_page(url: str) -> str:
    """Fetch URL, return clean body text followed by a 'Links on this page:' section."""
    if not url.startswith("https://"):
        return f"Error: Only HTTPS URLs are permitted. Received: {url!r}"

    try:
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=True, max_redirects=5
        ) as client:
            resp = await client.get(
                url, headers={"User-Agent": "Sherpa-Advisor-Bot/1.0"}
            )
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Collect internal links before stripping tags
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        seen: set[str] = set()
        links: list[str] = []
        for a in soup.find_all("a", href=True):
            href: str = a["href"].strip()
            if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            if href.startswith("/"):
                display = href  # keep relative — Claude can resolve against base
            elif href.startswith("https://") or href.startswith("http://"):
                # Only keep same-domain links
                if urlparse(href).netloc != urlparse(url).netloc:
                    continue
                display = href
            else:
                # Relative path without leading slash — resolve to absolute
                display = urljoin(url, href)
            if display not in seen:
                seen.add(display)
                links.append(display)
            if len(links) >= _MAX_LINKS:
                break

        # Strip nav/footer noise, then extract text
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
        logger.error("fetch_page failed for url=%r: %s", url, exc, exc_info=True)
        return f"Error fetching {url}: {exc}"


async def execute_tool(name: str, inputs: dict) -> str:
    """Dispatch a tool call by name. Always returns a string."""
    if name == "search_web":
        return await search_web(inputs.get("query", ""))
    if name == "fetch_page":
        return await fetch_page(inputs.get("url", ""))
    return f"Error: Unknown tool '{name}'"
