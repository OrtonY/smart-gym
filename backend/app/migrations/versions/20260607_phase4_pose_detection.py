"""phase 4 pose detection

Revision ID: 20260607_phase4_pose
Revises: 20260606_plan_item_dates
Create Date: 2026-06-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_phase4_pose"
down_revision: Union[str, Sequence[str], None] = "20260606_plan_item_dates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pose_detection_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("workout_session_id", sa.Integer(), nullable=True),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("workout_mode_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("reps_counted", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback_summary", sa.Text(), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("landmarks_sample_json", sa.JSON(), nullable=True),
        sa.Column("ai_advice", sa.Text(), nullable=True),
        sa.Column("ai_provider_type", sa.String(length=80), nullable=True),
        sa.Column("ai_model_name", sa.String(length=160), nullable=True),
        sa.Column("ai_generated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["exercise_id"], ["exercise_library.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["workout_mode_id"], ["workout_modes.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workout_session_id"], ["workout_sessions.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_pose_detection_results_id"), "pose_detection_results", ["id"]
    )
    op.create_index(
        op.f("ix_pose_detection_results_user_id"),
        "pose_detection_results",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_pose_detection_results_workout_session_id"),
        "pose_detection_results",
        ["workout_session_id"],
    )
    op.create_index(
        op.f("ix_pose_detection_results_exercise_id"),
        "pose_detection_results",
        ["exercise_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_pose_detection_results_exercise_id"),
        table_name="pose_detection_results",
    )
    op.drop_index(
        op.f("ix_pose_detection_results_workout_session_id"),
        table_name="pose_detection_results",
    )
    op.drop_index(
        op.f("ix_pose_detection_results_user_id"),
        table_name="pose_detection_results",
    )
    op.drop_index(
        op.f("ix_pose_detection_results_id"),
        table_name="pose_detection_results",
    )
    op.drop_table("pose_detection_results")
