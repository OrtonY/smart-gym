from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutSessionStep(Base):
    __tablename__ = "workout_session_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workout_session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
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
    planned_sets: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    planned_reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    planned_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    planned_rest_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    actual_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    pose_detection_result_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("pose_detection_results.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
