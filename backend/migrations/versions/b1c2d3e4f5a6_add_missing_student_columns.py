"""add_missing_student_columns

Adds credits_attempted and display_name to the students table.
Uses IF NOT EXISTS so this is safe to run even if one column already exists.

Revision ID: b1c2d3e4f5a6
Revises: 7ab2b4e66e4f
Create Date: 2026-06-21 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "7ab2b4e66e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS credits_attempted INTEGER")
    op.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS display_name VARCHAR")


def downgrade() -> None:
    op.execute("ALTER TABLE students DROP COLUMN IF EXISTS credits_attempted")
    op.execute("ALTER TABLE students DROP COLUMN IF EXISTS display_name")
