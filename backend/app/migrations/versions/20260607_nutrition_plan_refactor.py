"""nutrition plan refactor

Revision ID: 20260607_nutrition_plan_refactor
Revises: 20260607_training_loop_refactor
Create Date: 2026-06-07 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_nutrition_plan_refactor"
down_revision: Union[str, Sequence[str], None] = "20260607_training_loop_refactor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nutrition_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("days_count", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_nutrition_plans_id"), "nutrition_plans", ["id"])
    op.create_index(
        op.f("ix_nutrition_plans_user_id"), "nutrition_plans", ["user_id"]
    )
    op.create_index(
        op.f("ix_nutrition_plans_start_date"), "nutrition_plans", ["start_date"]
    )
    op.create_index(
        op.f("ix_nutrition_plans_end_date"), "nutrition_plans", ["end_date"]
    )

    op.create_table(
        "nutrition_plan_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nutrition_plan_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False, server_default="manual"),
        sa.Column("user_prompt", sa.Text(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["nutrition_plan_id"], ["nutrition_plans.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "nutrition_plan_id",
            "version_number",
            name="uq_nutrition_plan_version_number",
        ),
    )
    op.create_index(
        op.f("ix_nutrition_plan_versions_id"), "nutrition_plan_versions", ["id"]
    )
    op.create_index(
        op.f("ix_nutrition_plan_versions_nutrition_plan_id"),
        "nutrition_plan_versions",
        ["nutrition_plan_id"],
    )

    op.create_table(
        "nutrition_plan_meals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nutrition_plan_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=40), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("food_items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("portion_notes", sa.Text(), nullable=True),
        sa.Column("target_calories_kcal", sa.Integer(), nullable=True),
        sa.Column("target_protein_g", sa.Float(), nullable=True),
        sa.Column("target_carbs_g", sa.Float(), nullable=True),
        sa.Column("target_fat_g", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="planned"),
        sa.Column("actual_calories_kcal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actual_protein_g", sa.Float(), nullable=True),
        sa.Column("actual_carbs_g", sa.Float(), nullable=True),
        sa.Column("actual_fat_g", sa.Float(), nullable=True),
        sa.Column("last_reconciled_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["nutrition_plan_id"], ["nutrition_plans.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_nutrition_plan_meals_id"), "nutrition_plan_meals", ["id"]
    )
    op.create_index(
        op.f("ix_nutrition_plan_meals_nutrition_plan_id"),
        "nutrition_plan_meals",
        ["nutrition_plan_id"],
    )
    op.create_index(
        op.f("ix_nutrition_plan_meals_version_number"),
        "nutrition_plan_meals",
        ["version_number"],
    )
    op.create_index(
        op.f("ix_nutrition_plan_meals_scheduled_date"),
        "nutrition_plan_meals",
        ["scheduled_date"],
    )
    op.create_index(
        op.f("ix_nutrition_plan_meals_meal_type"),
        "nutrition_plan_meals",
        ["meal_type"],
    )

    op.add_column(
        "nutrition_logs",
        sa.Column("nutrition_plan_meal_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_nutrition_logs_nutrition_plan_meal_id",
        "nutrition_logs",
        "nutrition_plan_meals",
        ["nutrition_plan_meal_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_nutrition_logs_nutrition_plan_meal_id"),
        "nutrition_logs",
        ["nutrition_plan_meal_id"],
    )
    op.add_column(
        "ai_conversations",
        sa.Column("nutrition_plan_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_ai_conversations_nutrition_plan_id",
        "ai_conversations",
        "nutrition_plans",
        ["nutrition_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_ai_conversations_nutrition_plan_id",
        "ai_conversations",
        type_="foreignkey",
    )
    op.drop_column("ai_conversations", "nutrition_plan_id")
    op.drop_index(
        op.f("ix_nutrition_logs_nutrition_plan_meal_id"),
        table_name="nutrition_logs",
    )
    op.drop_constraint(
        "fk_nutrition_logs_nutrition_plan_meal_id",
        "nutrition_logs",
        type_="foreignkey",
    )
    op.drop_column("nutrition_logs", "nutrition_plan_meal_id")

    op.drop_index(
        op.f("ix_nutrition_plan_meals_meal_type"),
        table_name="nutrition_plan_meals",
    )
    op.drop_index(
        op.f("ix_nutrition_plan_meals_scheduled_date"),
        table_name="nutrition_plan_meals",
    )
    op.drop_index(
        op.f("ix_nutrition_plan_meals_version_number"),
        table_name="nutrition_plan_meals",
    )
    op.drop_index(
        op.f("ix_nutrition_plan_meals_nutrition_plan_id"),
        table_name="nutrition_plan_meals",
    )
    op.drop_index(op.f("ix_nutrition_plan_meals_id"), table_name="nutrition_plan_meals")
    op.drop_table("nutrition_plan_meals")

    op.drop_index(
        op.f("ix_nutrition_plan_versions_nutrition_plan_id"),
        table_name="nutrition_plan_versions",
    )
    op.drop_index(
        op.f("ix_nutrition_plan_versions_id"), table_name="nutrition_plan_versions"
    )
    op.drop_table("nutrition_plan_versions")

    op.drop_index(op.f("ix_nutrition_plans_end_date"), table_name="nutrition_plans")
    op.drop_index(op.f("ix_nutrition_plans_start_date"), table_name="nutrition_plans")
    op.drop_index(op.f("ix_nutrition_plans_user_id"), table_name="nutrition_plans")
    op.drop_index(op.f("ix_nutrition_plans_id"), table_name="nutrition_plans")
    op.drop_table("nutrition_plans")
