"""fix leaderboard refresh states table

Revision ID: 20260606_fix_lb_refresh
Revises: 20260606_phase2
Create Date: 2026-06-06 21:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_fix_lb_refresh"
down_revision: Union[str, Sequence[str], None] = "20260606_phase2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("leaderboard_refresh_states"):
        return

    op.create_table(
        "leaderboard_refresh_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("period_type", sa.String(length=40), nullable=False),
        sa.Column("metric_type", sa.String(length=60), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("refreshed_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "period_type",
            "metric_type",
            "period_start",
            name="uq_leaderboard_refresh_state_period_metric",
        ),
    )
    op.create_index(
        op.f("ix_leaderboard_refresh_states_id"),
        "leaderboard_refresh_states",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_leaderboard_refresh_states_metric_type"),
        "leaderboard_refresh_states",
        ["metric_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_leaderboard_refresh_states_period_end"),
        "leaderboard_refresh_states",
        ["period_end"],
        unique=False,
    )
    op.create_index(
        op.f("ix_leaderboard_refresh_states_period_start"),
        "leaderboard_refresh_states",
        ["period_start"],
        unique=False,
    )
    op.create_index(
        op.f("ix_leaderboard_refresh_states_period_type"),
        "leaderboard_refresh_states",
        ["period_type"],
        unique=False,
    )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("leaderboard_refresh_states"):
        return

    op.drop_index(
        op.f("ix_leaderboard_refresh_states_period_type"),
        table_name="leaderboard_refresh_states",
    )
    op.drop_index(
        op.f("ix_leaderboard_refresh_states_period_start"),
        table_name="leaderboard_refresh_states",
    )
    op.drop_index(
        op.f("ix_leaderboard_refresh_states_period_end"),
        table_name="leaderboard_refresh_states",
    )
    op.drop_index(
        op.f("ix_leaderboard_refresh_states_metric_type"),
        table_name="leaderboard_refresh_states",
    )
    op.drop_index(
        op.f("ix_leaderboard_refresh_states_id"),
        table_name="leaderboard_refresh_states",
    )
    op.drop_table("leaderboard_refresh_states")
