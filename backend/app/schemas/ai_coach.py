from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.training_plans import TrainingPlanDetailResponse


class GenerateTrainingPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)

    model_config = ConfigDict(extra="forbid")


class AdjustTrainingPlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    target_date: Optional[date] = None

    model_config = ConfigDict(extra="forbid")


class AiTrainingPlanResponse(BaseModel):
    conversation_id: int
    plan: TrainingPlanDetailResponse
