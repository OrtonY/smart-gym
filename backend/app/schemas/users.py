from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserProfileBase(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_goal: Optional[str] = None
    training_frequency: Optional[str] = None
    dietary_preferences: Optional[str] = None


class UserProfileUpdate(UserProfileBase):
    pass


class UserProfileResponse(UserProfileBase):
    model_config = ConfigDict(from_attributes=True)
