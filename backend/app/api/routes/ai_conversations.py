from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.ai_conversations import (
    AiConversationDetailResponse,
    AiConversationSummaryResponse,
)
from app.services.ai_conversation_service import (
    VALID_TOPICS,
    get_ai_conversation_detail,
    list_ai_conversations,
)

router = APIRouter()


@router.get("", response_model=list[AiConversationSummaryResponse])
def list_my_ai_conversations(
    topic: Optional[str] = Query(default=None),
    training_plan_id: Optional[int] = Query(default=None),
    nutrition_plan_id: Optional[int] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AiConversationSummaryResponse]:
    if topic is not None and topic not in VALID_TOPICS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid conversation topic",
        )
    return list_ai_conversations(
        db,
        current_user.id,
        topic=topic,
        training_plan_id=training_plan_id,
        nutrition_plan_id=nutrition_plan_id,
    )


@router.get("/{conversation_id}", response_model=AiConversationDetailResponse)
def get_my_ai_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiConversationDetailResponse:
    detail = get_ai_conversation_detail(db, current_user.id, conversation_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI conversation not found",
        )
    return detail
