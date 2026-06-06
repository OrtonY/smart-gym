from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkoutModeBase(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    estimated_calories_per_hour: int = Field(ge=0, le=2000)
    is_active: bool = True


class WorkoutModeCreate(WorkoutModeBase):
    pass


class WorkoutModeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    estimated_calories_per_hour: Optional[int] = Field(default=None, ge=0, le=2000)
    is_active: Optional[bool] = None

    model_config = ConfigDict(extra="forbid")


class WorkoutModeResponse(WorkoutModeBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ExerciseBase(BaseModel):
    slug: str = Field(min_length=2, max_length=120)
    name: str = Field(..., min_length=1, max_length=120)
    target_muscle: str = Field(..., min_length=1, max_length=120)
    difficulty: str = Field(pattern="^(beginner|intermediate|advanced)$")
    description: Optional[str] = None
    tutorial_url: Optional[str] = Field(default=None, max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=500)
    detection_rules: Optional[dict[str, Any]] = None
    is_published: bool = False


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    target_muscle: Optional[str] = Field(default=None, min_length=1, max_length=120)
    difficulty: Optional[str] = Field(
        default=None, pattern="^(beginner|intermediate|advanced)$"
    )
    description: Optional[str] = None
    tutorial_url: Optional[str] = Field(default=None, max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=500)
    detection_rules: Optional[dict[str, Any]] = None
    is_published: Optional[bool] = None

    model_config = ConfigDict(extra="forbid")


class ExerciseResponse(ExerciseBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
