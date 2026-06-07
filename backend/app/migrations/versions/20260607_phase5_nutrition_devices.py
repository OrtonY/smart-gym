"""phase 5 nutrition and device metrics

Revision ID: 20260607_phase5_nutrition
Revises: 20260607_phase4_pose
Create Date: 2026-06-07 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_phase5_nutrition"
down_revision: Union[str, Sequence[str], None] = "20260607_phase4_pose"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nutrition_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("logged_at", sa.DateTime(), nullable=False),
        sa.Column("meal_type", sa.String(length=40), nullable=False),
        sa.Column("food_name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_path", sa.String(length=500), nullable=True),
        sa.Column("calories_kcal", sa.Integer(), nullable=False),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("ai_confidence", sa.Float(), nullable=True),
        sa.Column("ai_provider_type", sa.String(length=80), nullable=True),
        sa.Column("ai_model_name", sa.String(length=160), nullable=True),
        sa.Column("ai_raw_json", sa.JSON(), nullable=True),
        sa.Column("user_correction", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_nutrition_logs_id"), "nutrition_logs", ["id"])
    op.create_index(
        op.f("ix_nutrition_logs_user_id"), "nutrition_logs", ["user_id"]
    )

    op.create_table(
        "device_metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("metric_type", sa.String(length=80), nullable=False),
        sa.Column("measured_at", sa.DateTime(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=40), nullable=False),
        sa.Column("workout_session_id", sa.Integer(), nullable=True),
        sa.Column("raw_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["workout_session_id"], ["workout_sessions.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_device_metrics_id"), "device_metrics", ["id"])
    op.create_index(
        op.f("ix_device_metrics_user_id"), "device_metrics", ["user_id"]
    )
    op.create_index(
        op.f("ix_device_metrics_metric_type"), "device_metrics", ["metric_type"]
    )
    op.create_index(
        op.f("ix_device_metrics_measured_at"), "device_metrics", ["measured_at"]
    )
    op.create_index(
        op.f("ix_device_metrics_workout_session_id"),
        "device_metrics",
        ["workout_session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_device_metrics_workout_session_id"), table_name="device_metrics"
    )
    op.drop_index(op.f("ix_device_metrics_measured_at"), table_name="device_metrics")
    op.drop_index(op.f("ix_device_metrics_metric_type"), table_name="device_metrics")
    op.drop_index(op.f("ix_device_metrics_user_id"), table_name="device_metrics")
    op.drop_index(op.f("ix_device_metrics_id"), table_name="device_metrics")
    op.drop_table("device_metrics")

    op.drop_index(op.f("ix_nutrition_logs_user_id"), table_name="nutrition_logs")
    op.drop_index(op.f("ix_nutrition_logs_id"), table_name="nutrition_logs")
    op.drop_table("nutrition_logs")
