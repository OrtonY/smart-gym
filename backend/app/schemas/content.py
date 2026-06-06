from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkoutModeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    estimated_calories_per_hour: int = Field(default=300, ge=0)
    is_active: bool = True


class WorkoutModeCreate(WorkoutModeBase):
    pass


class WorkoutModeUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=80)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    estimated_calories_per_hour: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class WorkoutModeResponse(WorkoutModeBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ExerciseBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=120)
    target_muscle: str = Field(..., min_length=1, max_length=120)
    difficulty: str = Field(default="beginner", min_length=1, max_length=40)
    description: Optional[str] = None
    tutorial_url: Optional[str] = Field(default=None, max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=500)
    detection_rules: Optional[dict[str, Any]] = None
    is_published: bool = False


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=1, max_length=120)
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    target_muscle: Optional[str] = Field(default=None, min_length=1, max_length=120)
    difficulty: Optional[str] = Field(default=None, min_length=1, max_length=40)
    description: Optional[str] = None
    tutorial_url: Optional[str] = Field(default=None, max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=500)
    detection_rules: Optional[dict[str, Any]] = None
    is_published: Optional[bool] = None


class ExerciseResponse(ExerciseBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
