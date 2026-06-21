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
    op.create_unique_constraint("uq_students_supabase_user_id", "students", ["supabase_user_id"])
    # Allow students synced from Supabase to not yet have a matched school row
    op.alter_column("students", "school_id", existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column("students", "school_id", existing_type=sa.UUID(), nullable=False)
    op.drop_constraint("uq_students_supabase_user_id", "students", type_="unique")
    op.drop_column("students", "supabase_user_id")
