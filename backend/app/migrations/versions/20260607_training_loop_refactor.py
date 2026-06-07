"""training loop refactor

Revision ID: 20260607_training_loop_refactor
Revises: 20260607_phase5_nutrition
Create Date: 2026-06-07 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_training_loop_refactor"
down_revision: Union[str, Sequence[str], None] = "20260607_phase5_nutrition"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workout_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("goal", sa.String(length=120), nullable=False),
        sa.Column("difficulty", sa.String(length=40), nullable=False),
        sa.Column("target_muscles", sa.String(length=255), nullable=False),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("recommendation_weight", sa.Integer(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workout_templates_id"), "workout_templates", ["id"])
    op.create_index(
        op.f("ix_workout_templates_slug"),
        "workout_templates",
        ["slug"],
        unique=True,
    )
    op.create_index(
        op.f("ix_workout_templates_goal"), "workout_templates", ["goal"]
    )
    op.create_index(
        op.f("ix_workout_templates_difficulty"),
        "workout_templates",
        ["difficulty"],
    )
    op.create_index(
        op.f("ix_workout_templates_is_published"),
        "workout_templates",
        ["is_published"],
    )

    op.create_table(
        "workout_template_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workout_template_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("workout_mode_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=True),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("instruction", sa.Text(), nullable=True),
        sa.Column("allow_pose_detection", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["exercise_id"], ["exercise_library.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workout_mode_id"], ["workout_modes.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workout_template_id"], ["workout_templates.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workout_template_steps_id"), "workout_template_steps", ["id"]
    )
    op.create_index(
        op.f("ix_workout_template_steps_workout_template_id"),
        "workout_template_steps",
        ["workout_template_id"],
    )

    op.add_column(
        "user_profiles",
        sa.Column(
            "timezone",
            sa.String(length=80),
            nullable=False,
            server_default="Asia/Shanghai",
        ),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("instruction", sa.Text(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("source_template_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("source_template_step_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column(
            "entry_type",
            sa.String(length=40),
            nullable=False,
            server_default="scheduled",
        ),
    )
    op.add_column(
        "training_plan_items",
        sa.Column(
            "status",
            sa.String(length=40),
            nullable=False,
            server_default="planned",
        ),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("linked_workout_session_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("actual_duration_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "training_plan_items",
        sa.Column("actual_score", sa.Float(), nullable=True),
    )
    op.create_foreign_key(
        "fk_training_plan_items_source_template_id",
        "training_plan_items",
        "workout_templates",
        ["source_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_training_plan_items_source_template_step_id",
        "training_plan_items",
        "workout_template_steps",
        ["source_template_step_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_training_plan_items_status"),
        "training_plan_items",
        ["status"],
    )
    op.create_index(
        op.f("ix_training_plan_items_entry_type"),
        "training_plan_items",
        ["entry_type"],
    )

    op.add_column(
        "workout_sessions",
        sa.Column(
            "source_type",
            sa.String(length=40),
            nullable=False,
            server_default="free",
        ),
    )
    op.add_column(
        "workout_sessions",
        sa.Column("source_plan_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "workout_sessions",
        sa.Column("source_plan_item_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "workout_sessions",
        sa.Column("source_template_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "workout_sessions",
        sa.Column(
            "pose_detection_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "workout_sessions",
        sa.Column(
            "completed_steps_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "workout_sessions",
        sa.Column(
            "total_steps_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.create_foreign_key(
        "fk_workout_sessions_source_plan_id",
        "workout_sessions",
        "training_plans",
        ["source_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workout_sessions_source_plan_item_id",
        "workout_sessions",
        "training_plan_items",
        ["source_plan_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_workout_sessions_source_template_id",
        "workout_sessions",
        "workout_templates",
        ["source_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_workout_sessions_source_type"),
        "workout_sessions",
        ["source_type"],
    )
    op.create_index(
        op.f("ix_workout_sessions_source_plan_item_id"),
        "workout_sessions",
        ["source_plan_item_id"],
    )
    op.create_index(
        op.f("ix_workout_sessions_source_template_id"),
        "workout_sessions",
        ["source_template_id"],
    )

    op.create_foreign_key(
        "fk_training_plan_items_linked_workout_session_id",
        "training_plan_items",
        "workout_sessions",
        ["linked_workout_session_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "workout_session_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("workout_session_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("workout_mode_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("planned_sets", sa.Integer(), nullable=True),
        sa.Column("planned_reps", sa.Integer(), nullable=True),
        sa.Column("planned_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("planned_rest_seconds", sa.Integer(), nullable=True),
        sa.Column("actual_reps", sa.Integer(), nullable=True),
        sa.Column("actual_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("pose_detection_result_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["exercise_id"], ["exercise_library.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["pose_detection_result_id"],
            ["pose_detection_results.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["workout_mode_id"], ["workout_modes.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["workout_session_id"], ["workout_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workout_session_steps_id"), "workout_session_steps", ["id"]
    )
    op.create_index(
        op.f("ix_workout_session_steps_workout_session_id"),
        "workout_session_steps",
        ["workout_session_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_workout_session_steps_workout_session_id"),
        table_name="workout_session_steps",
    )
    op.drop_index(op.f("ix_workout_session_steps_id"), table_name="workout_session_steps")
    op.drop_table("workout_session_steps")

    op.drop_constraint(
        "fk_training_plan_items_linked_workout_session_id",
        "training_plan_items",
        type_="foreignkey",
    )

    op.drop_index(
        op.f("ix_workout_sessions_source_template_id"), table_name="workout_sessions"
    )
    op.drop_index(
        op.f("ix_workout_sessions_source_plan_item_id"), table_name="workout_sessions"
    )
    op.drop_index(op.f("ix_workout_sessions_source_type"), table_name="workout_sessions")
    op.drop_constraint(
        "fk_workout_sessions_source_template_id",
        "workout_sessions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_workout_sessions_source_plan_item_id",
        "workout_sessions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_workout_sessions_source_plan_id",
        "workout_sessions",
        type_="foreignkey",
    )
    op.drop_column("workout_sessions", "total_steps_count")
    op.drop_column("workout_sessions", "completed_steps_count")
    op.drop_column("workout_sessions", "pose_detection_enabled")
    op.drop_column("workout_sessions", "source_template_id")
    op.drop_column("workout_sessions", "source_plan_item_id")
    op.drop_column("workout_sessions", "source_plan_id")
    op.drop_column("workout_sessions", "source_type")

    op.drop_index(op.f("ix_training_plan_items_entry_type"), table_name="training_plan_items")
    op.drop_index(op.f("ix_training_plan_items_status"), table_name="training_plan_items")
    op.drop_constraint(
        "fk_training_plan_items_source_template_step_id",
        "training_plan_items",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_training_plan_items_source_template_id",
        "training_plan_items",
        type_="foreignkey",
    )
    op.drop_column("training_plan_items", "actual_score")
    op.drop_column("training_plan_items", "actual_duration_seconds")
    op.drop_column("training_plan_items", "completed_at")
    op.drop_column("training_plan_items", "linked_workout_session_id")
    op.drop_column("training_plan_items", "status")
    op.drop_column("training_plan_items", "entry_type")
    op.drop_column("training_plan_items", "source_template_step_id")
    op.drop_column("training_plan_items", "source_template_id")
    op.drop_column("training_plan_items", "instruction")
    op.drop_column("training_plan_items", "rest_seconds")
    op.drop_column("training_plan_items", "duration_seconds")
    op.drop_column("user_profiles", "timezone")

    op.drop_index(
        op.f("ix_workout_template_steps_workout_template_id"),
        table_name="workout_template_steps",
    )
    op.drop_index(op.f("ix_workout_template_steps_id"), table_name="workout_template_steps")
    op.drop_table("workout_template_steps")
    op.drop_index(op.f("ix_workout_templates_is_published"), table_name="workout_templates")
    op.drop_index(op.f("ix_workout_templates_difficulty"), table_name="workout_templates")
    op.drop_index(op.f("ix_workout_templates_goal"), table_name="workout_templates")
    op.drop_index(op.f("ix_workout_templates_slug"), table_name="workout_templates")
    op.drop_index(op.f("ix_workout_templates_id"), table_name="workout_templates")
    op.drop_table("workout_templates")
