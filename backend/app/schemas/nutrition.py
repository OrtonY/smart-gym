from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class NutritionLogCreate(BaseModel):
    logged_at: datetime
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner|snack|other)$")
    food_name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2_000)
    calories_kcal: int = Field(ge=0, le=10_000)
    protein_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    carbs_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    fat_g: Optional[float] = Field(default=None, ge=0, le=1_000)

    model_config = ConfigDict(extra="forbid")


class NutritionLogCorrection(BaseModel):
    food_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2_000)
    calories_kcal: Optional[int] = Field(default=None, ge=0, le=10_000)
    protein_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    carbs_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    fat_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    user_correction: str = Field(min_length=1, max_length=2_000)

    model_config = ConfigDict(extra="forbid")


class NutritionLogResponse(NutritionLogCreate):
    id: int
    user_id: int
    nutrition_plan_meal_id: Optional[int] = None
    image_path: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_provider_type: Optional[str] = None
    ai_model_name: Optional[str] = None
    ai_raw_json: Optional[dict[str, Any]] = None
    user_correction: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FoodRecognitionResponse(BaseModel):
    log: NutritionLogResponse
