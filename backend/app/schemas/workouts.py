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


class WorkoutSessionStepSnapshot(BaseModel):
    id: int
    sort_order: int
    exercise_id: Optional[int] = None
    workout_mode_id: Optional[int] = None
    title: str
    planned_sets: Optional[int] = None
    planned_reps: Optional[int] = None
    planned_duration_seconds: Optional[int] = None
    planned_rest_seconds: Optional[int] = None
    actual_reps: Optional[int] = None
    actual_duration_seconds: Optional[int] = None
    score: Optional[float] = None
    status: str
    pose_detection_result_id: Optional[int] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WorkoutSessionResponse(WorkoutSessionCreate):
    id: int
    user_id: int
    duration_minutes: int = Field(ge=0, le=1440)
    status: str = Field(pattern="^(in_progress|completed|partial|abandoned)$")
    source_type: str = "free"
    source_plan_id: Optional[int] = None
    source_plan_item_id: Optional[int] = None
    source_template_id: Optional[int] = None
    pose_detection_enabled: bool = False
    completed_steps_count: int = 0
    total_steps_count: int = 0
    steps: list[WorkoutSessionStepSnapshot] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class WorkoutSummaryResponse(BaseModel):
    sessions_count: int
    total_duration_minutes: int
    total_calories_burned: int


class WorkoutSessionStart(BaseModel):
    source_type: str = Field(pattern="^(plan|template|free)$")
    source_plan_id: Optional[int] = Field(default=None, ge=1)
    source_plan_item_id: Optional[int] = Field(default=None, ge=1)
    source_template_id: Optional[int] = Field(default=None, ge=1)
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    pose_detection_enabled: bool = False

    model_config = ConfigDict(extra="forbid")


class WorkoutSessionStartResponse(BaseModel):
    id: int
    user_id: int
    workout_mode_id: Optional[int] = None
    exercise_id: Optional[int] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_minutes: int
    calories_burned: int
    reps: Optional[int] = None
    score: Optional[float] = None
    status: str
    source_type: str
    source_plan_id: Optional[int] = None
    source_plan_item_id: Optional[int] = None
    source_template_id: Optional[int] = None
    pose_detection_enabled: bool
    completed_steps_count: int
    total_steps_count: int
    notes: Optional[str] = None
    steps: list[WorkoutSessionStepSnapshot] = Field(default_factory=list)


class WorkoutSessionStepFinish(BaseModel):
    sort_order: int = Field(ge=0, le=1000)
    title: str = Field(min_length=1, max_length=160)
    actual_reps: Optional[int] = Field(default=None, ge=0, le=100000)
    actual_duration_seconds: Optional[int] = Field(default=None, ge=0, le=86_400)
    score: Optional[float] = Field(default=None, ge=0, le=100)
    status: str = Field(pattern="^(completed|partial|skipped)$")
    pose_detection_result_id: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class WorkoutSessionFinish(BaseModel):
    ended_at: datetime
    duration_minutes: int = Field(ge=0, le=1440)
    calories_burned: int = Field(ge=0, le=10000)
    status: str = Field(pattern="^(completed|partial|abandoned)$")
    reps: Optional[int] = Field(default=None, ge=0, le=100000)
    score: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None
    steps: list[WorkoutSessionStepFinish] = Field(default_factory=list, max_length=200)

    model_config = ConfigDict(extra="forbid")
