from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class TodayWorkoutStepResponse(BaseModel):
    id: Optional[int] = None
    sort_order: int
    exercise_id: Optional[int] = None
    workout_mode_id: Optional[int] = None
    title: str
    sets: Optional[int] = None
    reps: Optional[int] = None
    duration_seconds: Optional[int] = None
    rest_seconds: Optional[int] = None
    instruction: Optional[str] = None
    allow_pose_detection: bool = False


class TodayWorkoutResponse(BaseModel):
    source_type: str = Field(pattern="^(plan|template|empty)$")
    source_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    difficulty: Optional[str] = None
    target_muscles: Optional[str] = None
    steps: list[TodayWorkoutStepResponse] = Field(default_factory=list)
    pose_detection_available: bool = False
    empty_state: Optional[str] = None
