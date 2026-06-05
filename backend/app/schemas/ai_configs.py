from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict


class AiProviderConfigBase(BaseModel):
    provider_type: str
    base_url: Optional[str] = None
    model_name: str
    is_active: bool = True


class AiProviderConfigCreate(AiProviderConfigBase):
    api_key: str


class AiProviderConfigUpdate(BaseModel):
    provider_type: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None


class AiProviderConfigResponse(AiProviderConfigBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
