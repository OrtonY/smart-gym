from __future__ import annotations

from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage


VALID_TOPICS = {"training_plan", "nutrition_plan", "food_record"}


def _conversation_title(
    conversation: AiConversation, last_message: Optional[AiMessage]
) -> str:
    if last_message and last_message.content.strip():
        return last_message.content.strip()[:40]
    if conversation.topic == "training_plan":
        return "训练计划对话"
    if conversation.topic == "nutrition_plan":
        return "饮食计划对话"
    return "食物识别对话"


def _summary(conversation: AiConversation, last_message: Optional[AiMessage]) -> dict[str, object]:
    preview = last_message.content.strip()[:80] if last_message else None
    return {
        "id": conversation.id,
        "user_id": conversation.user_id,
        "topic": conversation.topic,
        "training_plan_id": conversation.training_plan_id,
        "nutrition_plan_id": conversation.nutrition_plan_id,
        "title": _conversation_title(conversation, last_message),
        "last_message_preview": preview,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


def list_ai_conversations(
    db: Session,
    user_id: int,
    topic: Optional[str] = None,
    training_plan_id: Optional[int] = None,
    nutrition_plan_id: Optional[int] = None,
) -> list[dict[str, object]]:
    statement = select(AiConversation).where(AiConversation.user_id == user_id)
    if topic:
        statement = statement.where(AiConversation.topic == topic)
    if training_plan_id is not None:
        statement = statement.where(AiConversation.training_plan_id == training_plan_id)
    if nutrition_plan_id is not None:
        statement = statement.where(
            AiConversation.nutrition_plan_id == nutrition_plan_id
        )
    conversations = list(
        db.execute(
            statement.order_by(desc(AiConversation.updated_at), desc(AiConversation.id))
        ).scalars()
    )
    if not conversations:
        return []

    conversation_ids = [conversation.id for conversation in conversations]
    latest_messages_by_conversation_id: dict[int, AiMessage] = {}
    latest_messages = db.execute(
        select(AiMessage)
        .where(AiMessage.conversation_id.in_(conversation_ids))
        .order_by(
            desc(AiMessage.conversation_id),
            desc(AiMessage.created_at),
            desc(AiMessage.id),
        )
    ).scalars()
    for message in latest_messages:
        if message.conversation_id not in latest_messages_by_conversation_id:
            latest_messages_by_conversation_id[message.conversation_id] = message

    summaries: list[dict[str, object]] = []
    for conversation in conversations:
        last_message = latest_messages_by_conversation_id.get(conversation.id)
        summaries.append(_summary(conversation, last_message))
    return summaries


def get_ai_conversation_detail(
    db: Session, user_id: int, conversation_id: int
) -> Optional[dict[str, object]]:
    conversation = (
        db.execute(
            select(AiConversation).where(
                AiConversation.id == conversation_id,
                AiConversation.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )
    if conversation is None:
        return None
    messages = list(
        db.execute(
            select(AiMessage)
            .where(AiMessage.conversation_id == conversation.id)
            .order_by(AiMessage.created_at, AiMessage.id)
        ).scalars()
    )
    last_message = messages[-1] if messages else None
    return {**_summary(conversation, last_message), "messages": messages}


def get_user_conversation(
    db: Session,
    user_id: int,
    conversation_id: int,
    topic: str,
    training_plan_id: Optional[int] = None,
    nutrition_plan_id: Optional[int] = None,
) -> Optional[AiConversation]:
    conversation = (
        db.execute(
            select(AiConversation).where(
                AiConversation.id == conversation_id,
                AiConversation.user_id == user_id,
                AiConversation.topic == topic,
            )
        )
        .scalars()
        .first()
    )
    if conversation is None:
        return None
    if training_plan_id is not None and conversation.training_plan_id != training_plan_id:
        return None
    if nutrition_plan_id is not None and conversation.nutrition_plan_id != nutrition_plan_id:
        return None
    return conversation


def list_conversation_messages(
    db: Session, conversation_id: int, user_id: Optional[int] = None
) -> list[AiMessage]:
    statement = select(AiMessage).where(AiMessage.conversation_id == conversation_id)
    if user_id is not None:
        statement = statement.join(
            AiConversation, AiConversation.id == AiMessage.conversation_id
        ).where(AiConversation.user_id == user_id)
    return list(
        db.execute(statement.order_by(AiMessage.created_at, AiMessage.id)).scalars()
    )
