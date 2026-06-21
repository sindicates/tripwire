"""add_password_hash_to_students

Revision ID: 7ab2b4e66e4f
Revises: e1f2a3b4c5d6
Create Date: 2026-06-21 00:51:47.193458

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7ab2b4e66e4f'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash TEXT")


def downgrade() -> None:
    op.drop_column("students", "password_hash")
