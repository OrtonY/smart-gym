from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PoseDetectionResult(Base):
    __tablename__ = "pose_detection_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    workout_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    exercise_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exercise_library.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    workout_mode_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_modes.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    reps_counted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feedback_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    landmarks_sample_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    ai_advice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_provider_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    ai_model_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    ai_generated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
