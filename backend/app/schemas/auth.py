from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
