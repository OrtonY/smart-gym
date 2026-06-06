from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkoutSessionCreate(BaseModel):
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_minutes: int = Field(ge=1, le=1440)
    calories_burned: int = Field(ge=0, le=10000)
    reps: Optional[int] = Field(default=None, ge=0, le=100000)
    score: Optional[float] = Field(default=None, ge=0, le=100)
    status: str = Field(pattern="^(completed|abandoned)$")
    notes: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class WorkoutSessionResponse(WorkoutSessionCreate):
    id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)


class WorkoutSummaryResponse(BaseModel):
    sessions_count: int
    total_duration_minutes: int
    total_calories_burned: int
