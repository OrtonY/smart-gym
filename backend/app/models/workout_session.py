from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    workout_mode_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_modes.id"), nullable=True
    )
    exercise_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exercise_library.id"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    calories_burned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="completed")
    source_type: Mapped[str] = mapped_column(String(40), nullable=False, default="free")
    source_plan_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("training_plans.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_plan_item_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "training_plan_items.id",
            ondelete="SET NULL",
            use_alter=True,
        ),
        nullable=True,
    )
    source_template_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    pose_detection_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    completed_steps_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_steps_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
