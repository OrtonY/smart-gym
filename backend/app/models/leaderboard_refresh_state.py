from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeaderboardRefreshState(Base):
    __tablename__ = "leaderboard_refresh_states"
    __table_args__ = (
        UniqueConstraint(
            "period_type",
            "metric_type",
            "period_start",
            name="uq_leaderboard_refresh_state_period_metric",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    metric_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    refreshed_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
