"""phase 3 ai training plans

Revision ID: 20260606_phase3_ai_plans
Revises: 20260606_fix_lb_refresh
Create Date: 2026-06-06 21:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260606_phase3_ai_plans"
down_revision: Union[str, Sequence[str], None] = "20260606_fix_lb_refresh"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "training_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_plans_id"), "training_plans", ["id"])
    op.create_index(op.f("ix_training_plans_user_id"), "training_plans", ["user_id"])

    op.create_table(
        "training_plan_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_plan_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["training_plan_id"], ["training_plans.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "training_plan_id",
            "version_number",
            name="uq_training_plan_version_number",
        ),
    )
    op.create_index(
        op.f("ix_training_plan_versions_id"), "training_plan_versions", ["id"]
    )
    op.create_index(
        op.f("ix_training_plan_versions_training_plan_id"),
        "training_plan_versions",
        ["training_plan_id"],
    )

    op.create_table(
        "training_plan_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("training_plan_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("workout_mode_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=True),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise_library.id"]),
        sa.ForeignKeyConstraint(
            ["training_plan_id"], ["training_plans.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["workout_mode_id"], ["workout_modes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_training_plan_items_id"), "training_plan_items", ["id"])
    op.create_index(
        op.f("ix_training_plan_items_training_plan_id"),
        "training_plan_items",
        ["training_plan_id"],
    )
    op.create_index(
        op.f("ix_training_plan_items_version_number"),
        "training_plan_items",
        ["version_number"],
    )

    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=80), nullable=False),
        sa.Column("training_plan_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["training_plan_id"], ["training_plans.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_conversations_id"), "ai_conversations", ["id"])
    op.create_index(
        op.f("ix_ai_conversations_user_id"), "ai_conversations", ["user_id"]
    )

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=40), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("provider_type", sa.String(length=80), nullable=True),
        sa.Column("model_name", sa.String(length=160), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_messages_id"), "ai_messages", ["id"])
    op.create_index(
        op.f("ix_ai_messages_conversation_id"), "ai_messages", ["conversation_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_messages_conversation_id"), table_name="ai_messages")
    op.drop_index(op.f("ix_ai_messages_id"), table_name="ai_messages")
    op.drop_table("ai_messages")
    op.drop_index(op.f("ix_ai_conversations_user_id"), table_name="ai_conversations")
    op.drop_index(op.f("ix_ai_conversations_id"), table_name="ai_conversations")
    op.drop_table("ai_conversations")
    op.drop_index(
        op.f("ix_training_plan_items_version_number"),
        table_name="training_plan_items",
    )
    op.drop_index(
        op.f("ix_training_plan_items_training_plan_id"),
        table_name="training_plan_items",
    )
    op.drop_index(op.f("ix_training_plan_items_id"), table_name="training_plan_items")
    op.drop_table("training_plan_items")
    op.drop_index(
        op.f("ix_training_plan_versions_training_plan_id"),
        table_name="training_plan_versions",
    )
    op.drop_index(
        op.f("ix_training_plan_versions_id"), table_name="training_plan_versions"
    )
    op.drop_table("training_plan_versions")
    op.drop_index(op.f("ix_training_plans_user_id"), table_name="training_plans")
    op.drop_index(op.f("ix_training_plans_id"), table_name="training_plans")
    op.drop_table("training_plans")
