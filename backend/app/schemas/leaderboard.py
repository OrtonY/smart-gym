from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LeaderboardRefreshRequest(BaseModel):
    period_type: str = Field(pattern="^(weekly|monthly)$")
    metric_type: str = Field(
        pattern="^(duration_minutes|calories_burned|sessions_count)$"
    )
    anchor_date: date

    model_config = ConfigDict(extra="forbid")


class LeaderboardEntryResponse(BaseModel):
    display_name: str
    avatar_url: Optional[str]
    value: float
    rank: int
    period_type: str
    metric_type: str

    model_config = ConfigDict(from_attributes=True)
