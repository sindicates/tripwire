"""
seed_demo_data.py — Create or upsert demo School and Student rows for all four
pilot institutions. Safe to re-run: existing rows are updated, not duplicated.

Usage (from backend/):
    python -m scripts.seed_demo_data
"""
from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import select

sys.path.insert(0, ".")  # ensure `app` is importable when run from backend/

from app.database import AsyncSessionLocal
from app.models.school import School
from app.models.student import Student

# ---------------------------------------------------------------------------
# Demo schools
# ---------------------------------------------------------------------------

SCHOOLS: list[dict] = [
    {"name": "University of California, Berkeley", "slug_email_domain": "berkeley.edu"},
    {"name": "University of Pennsylvania",         "slug_email_domain": "upenn.edu"},
    {"name": "Case Western Reserve University",    "slug_email_domain": "case.edu"},
    {"name": "University of Nevada, Reno",         "slug_email_domain": "unr.edu"},
]

# ---------------------------------------------------------------------------
# Demo students — one per school.
# Deadlines use the real dates and source URLs verified before seeding.
# ---------------------------------------------------------------------------

STUDENTS: list[dict] = [
    {
        "email": "demo@berkeley.edu",
        "school_name": "University of California, Berkeley",
        "major": "Computer Science",
        "enrollment_year": 2023,
        "gpa": 2.1,
        "credits_completed": 54,
        "credits_attempted": 72,
        "credits_required": 120,
        "aid_package_json": {"gpa_requirement": 2.0, "annual_amount": 18000},
        "degree_audit_json": {
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
        },
    },
    {
        "email": "demo@unr.edu",
        "school_name": "University of Nevada, Reno",
        "major": "Mechanical Engineering",
        "enrollment_year": 2022,
        "gpa": 2.3,
        "credits_completed": 68,
        "credits_attempted": 90,
        "credits_required": 128,
        "aid_package_json": {"gpa_requirement": 2.0, "annual_amount": 12000},
        "degree_audit_json": {
            "credits_this_semester": 15,
            "deadlines": [
                {
                    "name": "Fall 2026 Add/Swap Deadline",
                    "date": "2026-08-28",
                    "timezone": "America/Los_Angeles",
                    "source_url": "https://www.unr.edu/admissions/records/academic-calendar",
                },
            ],
        },
    },
    {
        "email": "demo@upenn.edu",
        "school_name": "University of Pennsylvania",
        "major": "Economics",
        "enrollment_year": 2024,
        "gpa": 3.1,
        "credits_completed": 30,
        "credits_attempted": 36,
        "credits_required": 120,
        "aid_package_json": {"gpa_requirement": 2.0, "annual_amount": 22000},
        "degree_audit_json": {
            "credits_this_semester": 16,
            "deadlines": [
                {
                    "name": "Federal FAFSA Deadline (2026-27)",
                    "date": "2027-06-30",
                    "timezone": "America/New_York",
                    "source_url": "https://srfs.upenn.edu/policies/satisfactory-academic-progress",
                },
            ],
        },
    },
    {
        "email": "demo@case.edu",
        "school_name": "Case Western Reserve University",
        "major": "Biomedical Engineering",
        "enrollment_year": 2023,
        "gpa": 2.8,
        "credits_completed": 45,
        "credits_attempted": 54,
        "credits_required": 120,
        "aid_package_json": {"gpa_requirement": 2.0, "annual_amount": 30000},
        "degree_audit_json": {
            "credits_this_semester": 14,
            "deadlines": [
                {
                    "name": "Federal FAFSA Deadline (2026-27)",
                    "date": "2027-06-30",
                    "timezone": "America/New_York",
                    "source_url": "https://case.edu/financialaid/resources/financial-aid-satisfactory-academic-progress-undergraduate-students",
                },
            ],
        },
    },
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # Upsert schools — match on name, update nothing (just ensure existence)
        school_map: dict[str, uuid.UUID] = {}
        for spec in SCHOOLS:
            row = (await db.execute(
                select(School).where(School.name == spec["name"])
            )).scalar_one_or_none()
            if row is None:
                row = School(name=spec["name"])
                db.add(row)
                await db.flush()
                print(f"  + school  {spec['name']}")
            else:
                print(f"  = school  {spec['name']} (exists)")
            school_map[spec["name"]] = row.id

        # Upsert students — match on email, update all mutable fields
        for spec in STUDENTS:
            school_id = school_map[spec["school_name"]]
            row = (await db.execute(
                select(Student).where(Student.email == spec["email"])
            )).scalar_one_or_none()
            if row is None:
                row = Student(email=spec["email"], school_id=school_id)
                db.add(row)
                action = "+"
            else:
                action = "="
            row.school_id         = school_id
            row.major             = spec["major"]
            row.enrollment_year   = spec["enrollment_year"]
            row.gpa               = spec["gpa"]
            row.credits_completed = spec["credits_completed"]
            row.credits_attempted = spec["credits_attempted"]
            row.credits_required  = spec["credits_required"]
            row.aid_package_json  = spec["aid_package_json"]
            row.degree_audit_json = spec["degree_audit_json"]
            await db.flush()
            label = "student" if action == "+" else "student"
            print(f"  {action} {label}  {spec['email']}")

        await db.commit()
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(seed())
