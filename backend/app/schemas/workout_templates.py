from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkoutTemplateStepBase(BaseModel):
    sort_order: int = Field(default=0, ge=0, le=1000)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=160)
    sets: Optional[int] = Field(default=None, ge=1, le=100)
    reps: Optional[int] = Field(default=None, ge=1, le=10000)
    duration_seconds: Optional[int] = Field(default=None, ge=1, le=86_400)
    rest_seconds: Optional[int] = Field(default=None, ge=0, le=86_400)
    instruction: Optional[str] = None
    allow_pose_detection: bool = True


class WorkoutTemplateStepCreate(WorkoutTemplateStepBase):
    model_config = ConfigDict(extra="forbid")


class WorkoutTemplateStepResponse(WorkoutTemplateStepBase):
    id: int
    workout_template_id: int

    model_config = ConfigDict(from_attributes=True)


class WorkoutTemplateBase(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    goal: str = Field(min_length=1, max_length=120)
    difficulty: str = Field(pattern="^(beginner|intermediate|advanced)$")
    target_muscles: str = Field(min_length=1, max_length=255)
    estimated_duration_minutes: int = Field(ge=1, le=1440)
    cover_url: Optional[str] = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=50)
    recommendation_weight: int = Field(default=0, ge=0, le=10_000)
    is_published: bool = False


class WorkoutTemplateCreate(WorkoutTemplateBase):
    slug: str = Field(min_length=2, max_length=120)
    steps: list[WorkoutTemplateStepCreate] = Field(default_factory=list, max_length=100)

    model_config = ConfigDict(extra="forbid")


class WorkoutTemplateUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = None
    goal: Optional[str] = Field(default=None, min_length=1, max_length=120)
    difficulty: Optional[str] = Field(
        default=None, pattern="^(beginner|intermediate|advanced)$"
    )
    target_muscles: Optional[str] = Field(default=None, min_length=1, max_length=255)
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    cover_url: Optional[str] = Field(default=None, max_length=500)
    tags: Optional[list[str]] = Field(default=None, max_length=50)
    recommendation_weight: Optional[int] = Field(default=None, ge=0, le=10_000)
    is_published: Optional[bool] = None
    steps: Optional[list[WorkoutTemplateStepCreate]] = Field(default=None, max_length=100)

    model_config = ConfigDict(extra="forbid")


class WorkoutTemplateResponse(WorkoutTemplateBase):
    id: int
    slug: str
    created_at: datetime
    updated_at: datetime
    steps: list[WorkoutTemplateStepResponse] = Field(default_factory=list)


class WorkoutTemplateApplyToPlan(BaseModel):
    scheduled_date: date
    plan_title: str = Field(default="我的训练计划", min_length=1, max_length=160)

    model_config = ConfigDict(extra="forbid")
