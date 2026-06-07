from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class PoseDetectionResultCreate(BaseModel):
    workout_session_id: Optional[int] = Field(default=None, ge=1)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = Field(ge=1, le=86_400)
    reps_counted: int = Field(ge=0, le=100_000)
    score: Optional[float] = Field(default=None, ge=0, le=100)
    feedback_summary: Optional[str] = Field(default=None, max_length=2_000)
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    landmarks_sample_json: Optional[dict[str, Any]] = None

    model_config = ConfigDict(extra="forbid")


class PoseDetectionResultResponse(PoseDetectionResultCreate):
    id: int
    user_id: int
    ai_advice: Optional[str] = None
    ai_provider_type: Optional[str] = None
    ai_model_name: Optional[str] = None
    ai_generated_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PoseAdviceResponse(BaseModel):
    result: PoseDetectionResultResponse
