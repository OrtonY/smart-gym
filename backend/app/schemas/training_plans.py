from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TrainingPlanItemBase(BaseModel):
    scheduled_date: Optional[date] = None
    day_of_week: Optional[int] = Field(default=None, ge=1, le=7)
    sort_order: int = Field(default=0, ge=0, le=1000)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    title: str = Field(min_length=1, max_length=160)
    sets: Optional[int] = Field(default=None, ge=1, le=100)
    reps: Optional[int] = Field(default=None, ge=1, le=10000)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    duration_seconds: Optional[int] = Field(default=None, ge=1, le=86_400)
    rest_seconds: Optional[int] = Field(default=None, ge=0, le=86_400)
    instruction: Optional[str] = None
    source_template_id: Optional[int] = Field(default=None, ge=1)
    source_template_step_id: Optional[int] = Field(default=None, ge=1)
    entry_type: str = Field(default="scheduled", pattern="^(scheduled|ad_hoc)$")
    status: str = Field(
        default="planned",
        pattern="^(planned|completed|partial|skipped|rescheduled)$",
    )
    notes: Optional[str] = None

    @model_validator(mode="after")
    def fill_day_of_week_from_date(self) -> "TrainingPlanItemBase":
        if self.day_of_week is None and self.scheduled_date is not None:
            self.day_of_week = self.scheduled_date.isoweekday()
        if self.day_of_week is None:
            raise ValueError("day_of_week is required when scheduled_date is missing")
        return self


class TrainingPlanItemCreate(TrainingPlanItemBase):
    model_config = ConfigDict(extra="forbid")


class TrainingPlanItemResponse(TrainingPlanItemBase):
    id: int
    training_plan_id: int
    version_number: int
    linked_workout_session_id: Optional[int] = None
    completed_at: Optional[datetime] = None
    actual_duration_seconds: Optional[int] = None
    actual_score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    items: list[TrainingPlanItemCreate] = Field(default_factory=list, max_length=200)
    change_summary: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class TrainingPlanItemsReplace(BaseModel):
    items: list[TrainingPlanItemCreate] = Field(min_length=1, max_length=200)
    change_summary: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class TrainingPlanVersionResponse(BaseModel):
    id: int
    training_plan_id: int
    version_number: int
    source: str
    change_summary: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanSummaryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    source: str
    current_version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrainingPlanDetailResponse(TrainingPlanSummaryResponse):
    items: list[TrainingPlanItemResponse]
    versions: list[TrainingPlanVersionResponse]


class TrainingPlanReconcileRequest(BaseModel):
    today: Optional[date] = None

    model_config = ConfigDict(extra="forbid")


class TrainingPlanReconcileResponse(BaseModel):
    skipped_items: int
    ad_hoc_entries_created: int
    reconciled_date: date
