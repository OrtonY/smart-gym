from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    goal: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    target_muscles: Mapped[str] = mapped_column(String(255), nullable=False)
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cover_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tags: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    recommendation_weight: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_published: Mapped[bool] = mapped_column(
        Boolean, index=True, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
