"""
demo_deadline_fire.py — Live-fire demo of the deadline_miss rule for the
Berkeley demo student, frozen at 2026-08-14 UTC (5 days before Aug 19).

No database required: constructs the student in memory, mirroring the record
that seed_demo_data.py would write to the DB.

Usage (from backend/):
    python -m scripts.demo_deadline_fire
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid

sys.path.insert(0, ".")

from app.services.risk_engine import SCHOOL_POLICIES, _evaluate_rules


@dataclass
class _Student:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    email: str = "demo@berkeley.edu"
    school_id: uuid.UUID = field(default_factory=uuid.uuid4)
    gpa: float | None = 2.1
    credits_completed: int | None = 54
    credits_attempted: int | None = 72
    credits_required: int | None = 120
    major: str | None = "Computer Science"
    enrollment_year: int | None = 2023
    aid_package_json: dict[str, Any] | None = field(
        default_factory=lambda: {"gpa_requirement": 2.0, "annual_amount": 18000}
    )
    degree_audit_json: dict[str, Any] | None = field(
        default_factory=lambda: {
            "credits_this_semester": 13,
            "deadlines": [
                {
                    "name": "Fall 2026 Instruction Begins",
                    "date": "2026-08-19",
                    "timezone": "America/Los_Angeles",
                    "source_url": "https://financialaid.berkeley.edu/apply-now/apply-for-aid/fafsa-completion-overview/",
                },
                {
                    "name": "FAFSA CA Priority Deadline (2026-27)",
                    "date": "2026-03-02",
                    "timezone": "America/Los_Angeles",
                    "source_url": "https://financialaid.berkeley.edu/apply-now/apply-for-aid/fafsa-completion-overview/",
                },
            ],
        }
    )


if __name__ == "__main__":
    student = _Student()
    policy  = SCHOOL_POLICIES["berkeley"]
    now     = datetime(2026, 8, 14, tzinfo=timezone.utc)  # 5 days before Aug 19

    print(f"now = {now.isoformat()}")
    print(f"policy = {policy['source']}\n")

    results = _evaluate_rules(student, policy, now=now)
    deadline_results = [r for r in results if r.risk_type == "deadline_miss"]

    if not deadline_results:
        print("No deadline_miss events fired.")
    else:
        for r in deadline_results:
            print(f"risk_type : {r.risk_type}")
            print(f"severity  : {r.severity}")
            print("context   :")
            for k, v in r.context.items():
                print(f"  {k}: {v!r}")
            print()
