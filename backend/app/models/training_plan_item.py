from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TrainingPlanItem(Base):
    __tablename__ = "training_plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    training_plan_id: Mapped[int] = mapped_column(
        ForeignKey("training_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    scheduled_date: Mapped[Optional[date]] = mapped_column(Date, index=True, nullable=True)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exercise_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exercise_library.id"), nullable=True
    )
    workout_mode_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_modes.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    sets: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rest_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    instruction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_template_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_template_step_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_template_steps.id", ondelete="SET NULL"),
        nullable=True,
    )
    entry_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="scheduled"
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    linked_workout_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "workout_sessions.id",
            ondelete="SET NULL",
            use_alter=True,
        ),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    actual_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
