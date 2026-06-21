"""
run_research_agent.py — Entry point for the Sherpa Research uAgent.

Start with:
    cd backend && python -m scripts.run_research_agent

The agent listens on port 8001 (configurable via UAGENT_PORT env var)
and exposes a REST endpoint at POST /rest/research for the FastAPI
backend to send research requests.

If the agent is not running, the FastAPI backend automatically falls
back to the direct ResearchAgent (in-process Claude loop).
"""
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s",
)

# Ensure the backend package is importable when run via `python -m scripts.run_research_agent`
sys.path.insert(0, ".")

from app.config import settings
from app.services.uagent_researcher import create_research_agent


def main() -> None:
    agent = create_research_agent()

    print("=" * 60)
    print("  Sherpa Research Agent (Fetch.ai uAgent)")
    print(f"  Address:  {agent.address}")
    print(f"  Port:     {settings.UAGENT_PORT}")
    print(f"  REST:     http://localhost:{settings.UAGENT_PORT}/rest/research")
    print("=" * 60)

    agent.run()


if __name__ == "__main__":
    main()
