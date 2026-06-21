"""
discover_and_ingest.py — Search-discovery agent for academic policies.

Given a school name, this script acts as an agent to:
1. Search the web for official policy pages (Financial Aid/SAP, Academic Notice/Probation, Academic Calendar/Deadlines).
2. Filter the URLs to ensure they belong to the school's official domain (.edu).
3. Ask Claude to select the most relevant policy seed URLs.
4. Crawl and ingest those pages into the vector database.

Usage (from backend/):
    python -m scripts.discover_and_ingest "University of California, Berkeley"
"""
from __future__ import annotations

import asyncio
import os
import sys
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

sys.path.insert(0, ".")

from app.database import AsyncSessionLocal
from app.models.school import School
from app.services.rag import rag_service


# Standard search queries per category
CATEGORIES = {
    "financial_aid_sap": "financial aid satisfactory academic progress sap policy site:.edu",
    "academic_notice": "registrar academic notice probation dismissal standing policy site:.edu",
    "deadlines_calendar": "academic calendar registrar deadlines add drop withdrawal site:.edu",
}


async def google_search_agent(query: str, school_name: str) -> list[str]:
    """
    Search agent mock/placeholder.
    In production, this would call Tavily, Google Custom Search API, or a scrapers.
    Here we show the API signature. If Tavily/Google Search keys are in environment,
    we fetch dynamically; otherwise we print instructions and fall back.
    """
    api_key = os.getenv("TAVILY_API_KEY")
    if api_key:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": f"{school_name} {query}",
                        "search_depth": "basic",
                        "include_domains": [".edu"],
                    },
                )
                r.raise_for_status()
                results = r.json().get("results", [])
                return [res["url"] for res in results if res.get("url")]
        except Exception as e:
            print(f"    Tavily search API failed: {e}")

    # Fallback / mock search results for our demo pilot schools to demonstrate integration
    domain_map = {
        "uc berkeley": "berkeley.edu",
        "university of california, berkeley": "berkeley.edu",
        "university of pennsylvania": "upenn.edu",
        "penn": "upenn.edu",
        "case western": "case.edu",
        "case western reserve university": "case.edu",
        "unr": "unr.edu",
        "university of nevada, reno": "unr.edu",
    }
    
    slug = school_name.lower().strip()
    domain = None
    for k, v in domain_map.items():
        if k in slug:
            domain = v
            break
            
    if domain == "berkeley.edu":
        if "financial" in query:
            return ["https://financialaid.berkeley.edu/apply-now/apply-for-aid/fafsa-completion-overview/"]
        elif "notice" in query or "probation" in query:
            return ["https://lsadvising.berkeley.edu/academic-difficulty/academic-notice"]
        else:
            return ["https://registrar.berkeley.edu/wp-content/uploads/UCB_AcademicCalendar_2026-27_a11y.pdf"]
            
    if domain == "upenn.edu":
        if "financial" in query:
            return ["https://srfs.upenn.edu/policies/satisfactory-academic-progress"]
        elif "notice" in query or "probation" in query:
            return ["https://advising.penn.edu/academic-standing-probation"]
        else:
            return ["https://almanac.upenn.edu/penn-academic-calendar"]

    # If no keys or matches, we return instructions
    print(f"    [Notice] Please configure TAVILY_API_KEY in .env to enable real-time search discovery.")
    return []


async def run_discovery_agent(school_name: str) -> None:
    async with AsyncSessionLocal() as db:
        # Find school in DB
        result = await db.execute(
            select(School).where(School.name.ilike(f"%{school_name}%"))
        )
        school = result.scalar_one_or_none()
        if not school:
            print(f"ERROR: School '{school_name}' not found in DB.")
            print("Please seed the database first.")
            return

        print(f"[*] Starting Discovery Agent for {school.name} (ID: {school.id})")
        
        # 1. Search discovery phase
        all_discovered_urls: set[str] = set()
        
        for category, query in CATEGORIES.items():
            print(f"  - Searching for {category}...")
            urls = await google_search_agent(query, school.name)
            
            # Filter URLs to match .edu and exclude common noise paths
            filtered_urls = []
            for url in urls:
                parsed = urllib.parse.urlparse(url)
                # Keep only .edu domains
                if not parsed.netloc.endswith(".edu") and not parsed.netloc.endswith("berkeley.edu") and not parsed.netloc.endswith("upenn.edu"):
                    continue
                # Exclude login/signup/assets/privacy/terms URLs
                path_lower = parsed.path.lower()
                if any(x in path_lower for x in ["/login", "/signup", "/assets", "/privacy", "/terms", "/contact"]):
                    continue
                filtered_urls.append(url)
                
            print(f"    Discovered {len(filtered_urls)} relevant URL(s)")
            all_discovered_urls.update(filtered_urls)

        if not all_discovered_urls:
            print("  No URLs discovered. Aborting.")
            return

        # 2. Relevance Filtering (Ask Claude to pick the top 3-5 urls to ingest)
        print(f"  - Querying Claude to rank and select top URLs for ingestion...")
        try:
            selected_urls = await rag_service._select_relevant_urls(
                "academic and financial aid rules and timelines",
                list(all_discovered_urls),
                school.name,
                max_select=5
            )
        except Exception as e:
            print(f"    Failed calling Claude for filtering: {e}. Defaulting to all discovered urls.")
            selected_urls = list(all_discovered_urls)[:5]

        print(f"  - Claude selected {len(selected_urls)} target seed URLs:")
        for idx, url in enumerate(selected_urls):
            print(f"    [{idx+1}] {url}")

        # 3. Crawl & Ingest Phase
        school.doc_ingestion_status = "loading"
        await db.commit()
        
        ingested_count = 0
        for url in selected_urls:
            print(f"  - Crawling and ingesting: {url}")
            try:
                # Crawl seed and links 1 hop away, up to 5 subpages per category to avoid bloating
                count = await rag_service.crawl_and_ingest(
                    school_id=school.id,
                    seed_url=url,
                    session=db,
                    max_pages=5
                )
                ingested_count += count
                print(f"    Ingested {count} chunks/pages from this source")
            except Exception as e:
                print(f"    Failed ingesting {url}: {e}")

        school.doc_ingestion_status = "complete"
        school.last_ingested_at = datetime.now(timezone.utc)
        await db.commit()
        
        print(f"\n[+] Agent Completed. Ingested total of {ingested_count} documents/chunks for {school.name}.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.discover_and_ingest \"School Name\"")
        sys.exit(1)
        
    name = sys.argv[1]
    asyncio.run(run_discovery_agent(name))
