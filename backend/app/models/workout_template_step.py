from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutTemplateStep(Base):
    __tablename__ = "workout_template_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workout_template_id: Mapped[int] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exercise_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exercise_library.id", ondelete="SET NULL"), nullable=True
    )
    workout_mode_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_modes.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    sets: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rest_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    instruction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allow_pose_detection: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
