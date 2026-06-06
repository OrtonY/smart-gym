from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Exercise(Base):
    __tablename__ = "exercise_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_muscle: Mapped[str] = mapped_column(String(120), nullable=False)
    difficulty: Mapped[str] = mapped_column(
        String(40), nullable=False, default="beginner"
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tutorial_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    detection_rules: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
