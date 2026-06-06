"""add training plan item scheduled dates

Revision ID: 20260606_plan_item_dates
Revises: 20260606_phase3_ai_plans
Create Date: 2026-06-06 22:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_plan_item_dates"
down_revision: Union[str, Sequence[str], None] = "20260606_phase3_ai_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "training_plan_items",
        sa.Column("scheduled_date", sa.Date(), nullable=True),
    )
    op.create_index(
        op.f("ix_training_plan_items_scheduled_date"),
        "training_plan_items",
        ["scheduled_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_training_plan_items_scheduled_date"),
        table_name="training_plan_items",
    )
    op.drop_column("training_plan_items", "scheduled_date")
