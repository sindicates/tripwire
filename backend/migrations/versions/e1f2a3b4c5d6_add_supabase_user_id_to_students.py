"""add_supabase_user_id_to_students

Revision ID: e1f2a3b4c5d6
Revises: c3f8a1d2e947
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "c3f8a1d2e947"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("students", sa.Column("supabase_user_id", sa.String(), nullable=True))
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_students_supabase_user_id ON students (supabase_user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_students_supabase_user_id")
    op.drop_column("students", "supabase_user_id")
