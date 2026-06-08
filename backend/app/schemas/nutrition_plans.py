from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NutritionPlanMealBase(BaseModel):
    scheduled_date: date
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner|snack)$")
    sort_order: int = Field(default=0, ge=0, le=1000)
    title: str = Field(min_length=1, max_length=160)
    food_items: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    portion_notes: Optional[str] = Field(default=None, max_length=2_000)
    target_calories_kcal: Optional[int] = Field(default=None, ge=0, le=10_000)
    target_protein_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    target_carbs_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    target_fat_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    notes: Optional[str] = Field(default=None, max_length=2_000)
    status: str = Field(
        default="planned",
        pattern="^(planned|logged|partial|over_target|missed)$",
    )

    model_config = ConfigDict(extra="forbid")


class NutritionPlanMealCreate(NutritionPlanMealBase):
    pass


class NutritionPlanMealResponse(NutritionPlanMealBase):
    id: int
    nutrition_plan_id: int
    version_number: int
    actual_calories_kcal: int
    actual_protein_g: Optional[float]
    actual_carbs_g: Optional[float]
    actual_fat_g: Optional[float]
    last_reconciled_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    start_date: date
    end_date: date
    days_count: int = Field(ge=1, le=14)
    meals: list[NutritionPlanMealCreate] = Field(min_length=1, max_length=56)
    change_summary: Optional[str] = Field(default=None, max_length=2_000)

    @model_validator(mode="after")
    def validate_dates(self) -> "NutritionPlanCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

    model_config = ConfigDict(extra="forbid")


class NutritionPlanMealsReplace(BaseModel):
    meals: list[NutritionPlanMealCreate] = Field(min_length=1, max_length=56)
    change_summary: Optional[str] = Field(default=None, max_length=2_000)
    user_prompt: Optional[str] = Field(default=None, max_length=4_000)

    model_config = ConfigDict(extra="forbid")


class NutritionPlanVersionResponse(BaseModel):
    id: int
    nutrition_plan_id: int
    version_number: int
    source: str
    user_prompt: Optional[str]
    change_summary: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanSummaryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    source: str
    current_version: int
    is_active: bool
    start_date: date
    end_date: date
    days_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanDetailResponse(NutritionPlanSummaryResponse):
    items: list[NutritionPlanMealResponse]
    versions: list[NutritionPlanVersionResponse]


class GenerateNutritionPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4_000)
    start_date: Optional[date] = None
    conversation_id: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(extra="forbid")


class AdjustNutritionPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4_000)
    conversation_id: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(extra="forbid")


class AiNutritionPlanResponse(BaseModel):
    conversation_id: int
    plan: NutritionPlanDetailResponse


class NutritionDailySummary(BaseModel):
    date: date
    target_calories_kcal: int
    actual_calories_kcal: int
    actual_protein_g: float
    actual_carbs_g: float
    actual_fat_g: float
    has_logs: bool


class NutritionTodaySummary(BaseModel):
    date: date
    target_calories_kcal: int
    actual_calories_kcal: int
    actual_protein_g: float
    actual_carbs_g: float
    actual_fat_g: float
    meals: list[NutritionPlanMealResponse]


class NutritionSummaryResponse(BaseModel):
    today: NutritionTodaySummary
    daily: list[NutritionDailySummary]


class NutritionReconcileRequest(BaseModel):
    today: Optional[date] = None

    model_config = ConfigDict(extra="forbid")


class NutritionReconcileResponse(BaseModel):
    updated_meals: int
    missed_meals: int
    reconciled_date: date
