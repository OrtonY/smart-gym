from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    height_cm: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    weight_kg: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    fitness_goal: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    training_frequency: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dietary_preferences: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
