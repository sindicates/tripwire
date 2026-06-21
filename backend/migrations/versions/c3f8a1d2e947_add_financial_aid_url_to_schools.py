"""add_financial_aid_url_to_schools

Revision ID: c3f8a1d2e947
Revises: a9493668adde
Create Date: 2026-06-20 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f8a1d2e947"
down_revision: Union[str, None] = "a9493668adde"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("financial_aid_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "financial_aid_url")
