from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NutritionPlanMeal(Base):
    __tablename__ = "nutrition_plan_meals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nutrition_plan_id: Mapped[int] = mapped_column(
        ForeignKey("nutrition_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    food_items: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    portion_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_calories_kcal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_carbs_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_fat_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    actual_calories_kcal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_carbs_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_fat_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_reconciled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
