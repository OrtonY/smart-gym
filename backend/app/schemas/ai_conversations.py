from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AiMessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    provider_type: Optional[str] = None
    model_name: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AiConversationSummaryResponse(BaseModel):
    id: int
    user_id: int
    topic: str
    training_plan_id: Optional[int] = None
    nutrition_plan_id: Optional[int] = None
    title: str
    last_message_preview: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AiConversationDetailResponse(AiConversationSummaryResponse):
    messages: list[AiMessageResponse]
