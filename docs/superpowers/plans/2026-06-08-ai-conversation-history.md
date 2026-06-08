# AI Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build entry-scoped AI conversation history, new conversations, context continuation, modal AI UX, simplified food recording, inline pose loading, and single-config AI settings.

**Architecture:** Reuse existing `ai_conversations` and `ai_messages` tables. Add focused backend schemas/services/routes for conversation list/detail and explicit `conversation_id` continuation, then add a reusable frontend modal that training, nutrition, and food flows configure with domain-specific send handlers.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, React 18, TypeScript, Vite, Tailwind, lucide-react.

---

## File Map

- Create `backend/app/schemas/ai_conversations.py`: response schemas for conversation summaries, details, and messages.
- Create `backend/app/services/ai_conversation_service.py`: list/detail/validation helpers for user-owned entry-scoped conversations.
- Create `backend/app/api/routes/ai_conversations.py`: authenticated list/detail routes.
- Modify `backend/app/api/router.py`: register `/ai-conversations`.
- Modify `backend/app/schemas/ai_coach.py`: add optional `conversation_id` to training generate/adjust payloads.
- Modify `backend/app/schemas/nutrition_plans.py`: add optional `conversation_id` to nutrition generate/adjust payloads.
- Modify `backend/app/schemas/nutrition.py`: add `conversation_id` to food recognition response.
- Modify `backend/app/services/ai_service.py`: use explicit conversation selection, include history in prompts, create food-recognition messages.
- Modify `backend/app/api/routes/nutrition.py`: accept `conversation_id` form field and return conversation id for food recognition.
- Create `backend/tests/test_ai_conversations.py`: list/detail/user-isolation tests.
- Modify `backend/tests/test_ai_coach_training_plans.py`: continuation tests for training plans.
- Modify `backend/tests/test_nutrition_plans.py`: continuation tests for nutrition plans.
- Modify `backend/tests/test_nutrition.py`: continuation and message persistence tests for food recognition.
- Modify `frontend/src/api/client.ts`: add conversation types/APIs, optional `conversationId` support for AI calls.
- Create `frontend/src/components/AiConversationModal.tsx`: reusable tabbed modal with history/new conversation states, messages, loading animation, optional food fields.
- Modify `frontend/src/pages/user/TrainingPlansPage.tsx`: replace inline AI panels with modal-based global/date AI.
- Modify `frontend/src/pages/user/NutritionPage.tsx`: replace AI plan modal and record mode split with unified record form plus AI modal.
- Modify `frontend/src/pages/user/PoseDetectionPage.tsx`: add inline loading animation for AI advice.
- Modify `frontend/src/pages/user/AiProviderSettingsPage.tsx`: single-config form with populated non-key fields.

## Task 1: Backend Conversation Schemas and Service

**Files:**
- Create: `backend/app/schemas/ai_conversations.py`
- Create: `backend/app/services/ai_conversation_service.py`
- Test: `backend/tests/test_ai_conversations.py`

- [ ] **Step 1: Write failing tests for conversation list/detail isolation**

Create `backend/tests/test_ai_conversations.py`:

```python
from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_list_ai_conversations_filters_by_user_and_topic(
    client, db_session, create_user_and_token
):
    owner, owner_token = create_user_and_token("conversation-owner@example.com")
    other, _ = create_user_and_token("conversation-other@example.com")
    owner_training = AiConversation(
        user_id=owner.id,
        topic="training_plan",
        training_plan_id=10,
    )
    owner_food = AiConversation(user_id=owner.id, topic="food_record")
    other_training = AiConversation(
        user_id=other.id,
        topic="training_plan",
        training_plan_id=10,
    )
    db_session.add_all([owner_training, owner_food, other_training])
    db_session.flush()
    db_session.add_all(
        [
            AiMessage(
                conversation_id=owner_training.id,
                role="user",
                content="生成训练计划",
            ),
            AiMessage(
                conversation_id=owner_food.id,
                role="user",
                content="识别午餐",
            ),
            AiMessage(
                conversation_id=other_training.id,
                role="user",
                content="其他用户",
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/ai-conversations?topic=training_plan&training_plan_id=10",
        headers=_auth(owner_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == owner_training.id
    assert data[0]["topic"] == "training_plan"
    assert data[0]["last_message_preview"] == "生成训练计划"


def test_get_ai_conversation_returns_ordered_messages_and_rejects_other_user(
    client, db_session, create_user_and_token
):
    owner, owner_token = create_user_and_token("conversation-detail-owner@example.com")
    _, other_token = create_user_and_token("conversation-detail-other@example.com")
    conversation = AiConversation(user_id=owner.id, topic="food_record")
    db_session.add(conversation)
    db_session.flush()
    db_session.add_all(
        [
            AiMessage(conversation_id=conversation.id, role="user", content="第一句"),
            AiMessage(conversation_id=conversation.id, role="assistant", content="回复"),
        ]
    )
    db_session.commit()

    owner_response = client.get(
        f"/api/ai-conversations/{conversation.id}",
        headers=_auth(owner_token),
    )
    other_response = client.get(
        f"/api/ai-conversations/{conversation.id}",
        headers=_auth(other_token),
    )

    assert owner_response.status_code == 200
    assert [message["content"] for message in owner_response.json()["messages"]] == [
        "第一句",
        "回复",
    ]
    assert other_response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_ai_conversations.py -v
```

Expected: fail with missing `/api/ai-conversations` route or missing module.

- [ ] **Step 3: Add schemas**

Create `backend/app/schemas/ai_conversations.py`:

```python
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
```

- [ ] **Step 4: Add service helpers**

Create `backend/app/services/ai_conversation_service.py`:

```python
from __future__ import annotations

from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage


VALID_TOPICS = {"training_plan", "nutrition_plan", "food_record"}


def _conversation_title(conversation: AiConversation, last_message: Optional[AiMessage]) -> str:
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
        statement = statement.where(AiConversation.nutrition_plan_id == nutrition_plan_id)
    conversations = list(
        db.execute(
            statement.order_by(desc(AiConversation.updated_at), desc(AiConversation.id))
        ).scalars()
    )
    summaries: list[dict[str, object]] = []
    for conversation in conversations:
        last_message = (
            db.execute(
                select(AiMessage)
                .where(AiMessage.conversation_id == conversation.id)
                .order_by(desc(AiMessage.created_at), desc(AiMessage.id))
            )
            .scalars()
            .first()
        )
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


def list_conversation_messages(db: Session, conversation_id: int) -> list[AiMessage]:
    return list(
        db.execute(
            select(AiMessage)
            .where(AiMessage.conversation_id == conversation_id)
            .order_by(AiMessage.created_at, AiMessage.id)
        ).scalars()
    )
```

- [ ] **Step 5: Run tests and expect route failure remains**

Run:

```bash
cd backend
pytest tests/test_ai_conversations.py -v
```

Expected: still fail until route is registered.

## Task 2: Backend Conversation Routes

**Files:**
- Create: `backend/app/api/routes/ai_conversations.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_ai_conversations.py`

- [ ] **Step 1: Add route module**

Create `backend/app/api/routes/ai_conversations.py`:

```python
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
```

- [ ] **Step 2: Register route**

Modify `backend/app/api/router.py` imports and router registration:

```python
from app.api.routes import (
    admin_content,
    ai_configs,
    ai_coach,
    ai_conversations,
    auth,
    catalog,
    devices,
    health,
    leaderboard,
    nutrition,
    pose,
    today,
    training_plans,
    users,
    workout_templates,
    workouts,
)
```

Add after `ai_coach`:

```python
api_router.include_router(
    ai_conversations.router,
    prefix="/ai-conversations",
    tags=["ai-conversations"],
)
```

- [ ] **Step 3: Run conversation tests**

Run:

```bash
cd backend
pytest tests/test_ai_conversations.py -v
```

Expected: pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add backend/app/schemas/ai_conversations.py backend/app/services/ai_conversation_service.py backend/app/api/routes/ai_conversations.py backend/app/api/router.py backend/tests/test_ai_conversations.py
git commit -m "feat: add ai conversation history api"
```

## Task 3: Backend Explicit Continuation for Training and Nutrition

**Files:**
- Modify: `backend/app/schemas/ai_coach.py`
- Modify: `backend/app/schemas/nutrition_plans.py`
- Modify: `backend/app/services/ai_service.py`
- Test: `backend/tests/test_ai_coach_training_plans.py`
- Test: `backend/tests/test_nutrition_plans.py`

- [ ] **Step 1: Add failing training continuation test**

Append to `backend/tests/test_ai_coach_training_plans.py`:

```python
def test_adjust_training_plan_can_continue_selected_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("training-continue@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    created = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "生成一周训练计划"},
    ).json()
    plan_id = created["plan"]["id"]
    conversation_id = created["conversation_id"]

    response = client.post(
        f"/api/ai-coach/training-plans/{plan_id}/adjust",
        headers=_auth(token),
        json={
            "message": "延续上面的计划，把周五改成恢复训练",
            "conversation_id": conversation_id,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["conversation_id"] == conversation_id
    messages = (
        db_session.query(AiMessage)
        .filter(AiMessage.conversation_id == conversation_id)
        .order_by(AiMessage.id)
        .all()
    )
    assert len(messages) == 4
    assert messages[-2].content == "延续上面的计划，把周五改成恢复训练"


def test_adjust_training_plan_rejects_mismatched_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("training-mismatch@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    first = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "生成第一份训练计划"},
    ).json()
    second = client.post(
        "/api/ai-coach/training-plans/generate",
        headers=_auth(token),
        json={"prompt": "生成第二份训练计划"},
    ).json()

    response = client.post(
        f"/api/ai-coach/training-plans/{second['plan']['id']}/adjust",
        headers=_auth(token),
        json={
            "message": "尝试串用会话",
            "conversation_id": first["conversation_id"],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI conversation not found"
```

- [ ] **Step 2: Add failing nutrition continuation test**

Append to `backend/tests/test_nutrition_plans.py`:

```python
def test_adjust_nutrition_plan_can_continue_selected_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-continue@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    created = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate 3 days"},
    ).json()
    plan_id = created["plan"]["id"]
    conversation_id = created["conversation_id"]

    response = client.post(
        f"/api/ai-coach/nutrition-plans/{plan_id}/adjust",
        headers=_auth(token),
        json={
            "prompt": "Continue this plan and make dinner lighter",
            "conversation_id": conversation_id,
        },
    )

    assert response.status_code == 200
    assert response.json()["conversation_id"] == conversation_id
    assert (
        db_session.query(AiMessage)
        .filter(AiMessage.conversation_id == conversation_id)
        .count()
        == 4
    )
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_ai_coach_training_plans.py::test_adjust_training_plan_can_continue_selected_conversation tests/test_ai_coach_training_plans.py::test_adjust_training_plan_rejects_mismatched_conversation tests/test_nutrition_plans.py::test_adjust_nutrition_plan_can_continue_selected_conversation -v
```

Expected: fail because `conversation_id` is forbidden by schemas.

- [ ] **Step 4: Add `conversation_id` fields to schemas**

Modify `backend/app/schemas/ai_coach.py`:

```python
class GenerateTrainingPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    conversation_id: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(extra="forbid")


class AdjustTrainingPlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    target_date: Optional[date] = None
    conversation_id: Optional[int] = Field(default=None, ge=1)

    model_config = ConfigDict(extra="forbid")
```

Modify `backend/app/schemas/nutrition_plans.py` by adding the same optional field to `GenerateNutritionPlanRequest` and `AdjustNutritionPlanRequest`:

```python
conversation_id: Optional[int] = Field(default=None, ge=1)
```

- [ ] **Step 5: Add conversation selection helpers in AI service**

Modify imports in `backend/app/services/ai_service.py`:

```python
from app.services.ai_conversation_service import (
    get_user_conversation,
    list_conversation_messages,
)
```

Add helper functions near `_latest_plan_conversation`:

```python
def _conversation_history_text(db: Session, conversation_id: int) -> str:
    messages = list_conversation_messages(db, conversation_id)
    if not messages:
        return ""
    lines = [f"{message.role}: {message.content}" for message in messages[-12:]]
    return "\n".join(lines)


def _select_training_conversation(
    db: Session,
    user_id: int,
    plan_id: int,
    conversation_id: Optional[int],
) -> Optional[AiConversation]:
    if conversation_id is not None:
        return get_user_conversation(
            db,
            user_id,
            conversation_id,
            "training_plan",
            training_plan_id=plan_id,
        )
    return _latest_plan_conversation(db, user_id, plan_id)


def _select_nutrition_conversation(
    db: Session,
    user_id: int,
    plan_id: int,
    conversation_id: Optional[int],
) -> Optional[AiConversation]:
    if conversation_id is not None:
        return get_user_conversation(
            db,
            user_id,
            conversation_id,
            "nutrition_plan",
            nutrition_plan_id=plan_id,
        )
    return _latest_nutrition_plan_conversation(db, user_id, plan_id)
```

- [ ] **Step 6: Use explicit conversations in adjust services**

In `adjust_ai_training_plan`, replace conversation selection block with:

```python
    conversation = _select_training_conversation(
        db, user_id, plan_id, payload.conversation_id
    )
    if conversation is None:
        if payload.conversation_id is not None:
            raise AiCoachError("AI conversation not found")
        conversation = AiConversation(
            user_id=user_id,
            topic="training_plan",
            training_plan_id=plan_id,
        )
        db.add(conversation)
        db.flush()
```

Before calling `generate_training_plan_items`, include history in prompts:

```python
    history_text = ""
    if payload.conversation_id is not None:
        selected = get_user_conversation(
            db,
            user_id,
            payload.conversation_id,
            "training_plan",
            training_plan_id=plan_id,
        )
        if selected is None:
            raise AiCoachError("AI conversation not found")
        history_text = _conversation_history_text(db, selected.id)
```

For target date prompt, add:

```python
                "Conversation history:",
                history_text or "No previous messages.",
```

For global prompt, change to:

```python
        prompt = "\n".join(
            [
                f"Today: {today.isoformat()}. Do not modify dates before today.",
                "Use scheduled_date for dates. Do not return weekday values.",
                f"Current plan items: {[item.title for item in current_items]}.",
                "Conversation history:",
                history_text or "No previous messages.",
                f"Adjustment request: {payload.message}",
            ]
        )
```

In `adjust_ai_nutrition_plan`, replace conversation selection with `_select_nutrition_conversation` and add history to the JSON prompt:

```python
    selected_conversation = None
    if payload.conversation_id is not None:
        selected_conversation = get_user_conversation(
            db,
            user_id,
            payload.conversation_id,
            "nutrition_plan",
            nutrition_plan_id=plan_id,
        )
        if selected_conversation is None:
            raise AiCoachError("AI conversation not found")
    history_text = (
        _conversation_history_text(db, selected_conversation.id)
        if selected_conversation is not None
        else ""
    )
```

Add `"conversation_history": history_text` to the `prompt = json.dumps(...)` payload.

Then select conversation:

```python
    conversation = _select_nutrition_conversation(
        db, user_id, plan_id, payload.conversation_id
    )
    if conversation is None:
        if payload.conversation_id is not None:
            raise AiCoachError("AI conversation not found")
        conversation = AiConversation(
            user_id=user_id,
            topic="nutrition_plan",
            nutrition_plan_id=plan_id,
        )
        db.add(conversation)
        db.flush()
```

- [ ] **Step 7: Run continuation tests**

Run:

```bash
cd backend
pytest tests/test_ai_coach_training_plans.py::test_adjust_training_plan_can_continue_selected_conversation tests/test_ai_coach_training_plans.py::test_adjust_training_plan_rejects_mismatched_conversation tests/test_nutrition_plans.py::test_adjust_nutrition_plan_can_continue_selected_conversation -v
```

Expected: pass.

- [ ] **Step 8: Run existing AI tests**

Run:

```bash
cd backend
pytest tests/test_ai_coach_training_plans.py tests/test_nutrition_plans.py -v
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add backend/app/schemas/ai_coach.py backend/app/schemas/nutrition_plans.py backend/app/services/ai_service.py backend/tests/test_ai_coach_training_plans.py backend/tests/test_nutrition_plans.py
git commit -m "feat: support ai plan conversation continuation"
```

## Task 4: Backend Food Recognition Conversation Persistence

**Files:**
- Modify: `backend/app/schemas/nutrition.py`
- Modify: `backend/app/api/routes/nutrition.py`
- Modify: `backend/app/services/ai_service.py`
- Test: `backend/tests/test_nutrition.py`

- [ ] **Step 1: Add failing food conversation test**

Append to `backend/tests/test_nutrition.py`:

```python
from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
```

Append test:

```python
def test_food_recognition_creates_and_continues_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("food-conversation@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    first = client.post(
        "/api/nutrition/recognize",
        headers=_auth(token),
        data={
            "meal_type": "lunch",
            "description": "鸡胸肉沙拉",
        },
    )
    assert first.status_code == 201
    conversation_id = first.json()["conversation_id"]

    second = client.post(
        "/api/nutrition/recognize",
        headers=_auth(token),
        data={
            "meal_type": "lunch",
            "description": "延续上一餐，酱汁少一点",
            "conversation_id": str(conversation_id),
        },
    )

    assert second.status_code == 201
    assert second.json()["conversation_id"] == conversation_id
    conversation = db_session.get(AiConversation, conversation_id)
    assert conversation.topic == "food_record"
    assert conversation.user_id == user.id
    assert (
        db_session.query(AiMessage)
        .filter(AiMessage.conversation_id == conversation_id)
        .count()
        == 4
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_nutrition.py::test_food_recognition_creates_and_continues_conversation -v
```

Expected: fail because `conversation_id` is missing from response.

- [ ] **Step 3: Extend response schema**

Modify `backend/app/schemas/nutrition.py`:

```python
class FoodRecognitionResponse(BaseModel):
    log: NutritionLogResponse
    conversation_id: int
```

- [ ] **Step 4: Add food message helper to AI service**

In `backend/app/services/ai_service.py`, add:

```python
def record_food_recognition_messages(
    db: Session,
    user_id: int,
    description: str,
    estimate: dict[str, Any],
    config: AiProviderConfig,
    conversation_id: Optional[int] = None,
) -> AiConversation:
    conversation = None
    if conversation_id is not None:
        conversation = get_user_conversation(
            db,
            user_id,
            conversation_id,
            "food_record",
        )
        if conversation is None:
            raise AiCoachError("AI conversation not found")
    if conversation is None:
        conversation = AiConversation(user_id=user_id, topic="food_record")
        db.add(conversation)
        db.flush()
    history_text = _conversation_history_text(db, conversation.id)
    user_content = "\n".join(
        [
            "Food recognition request:",
            description or "Image only",
            "Conversation history:",
            history_text or "No previous messages.",
        ]
    )
    _create_message(db, conversation.id, "user", user_content)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(estimate, ensure_ascii=False, default=str),
        config=config,
        metadata_json={"action": "recognize_food"},
    )
    return conversation
```

- [ ] **Step 5: Accept and persist conversation in food route**

Modify imports in `backend/app/api/routes/nutrition.py`:

```python
    record_food_recognition_messages,
```

Modify `recognize_my_food` signature:

```python
    conversation_id: Optional[int] = Form(None),
```

After `create_nutrition_log(...)`, before returning, add:

```python
        conversation = record_food_recognition_messages(
            db,
            current_user.id,
            cleaned_description,
            estimate,
            config,
            conversation_id=conversation_id,
        )
        db.commit()
        db.refresh(log)
        return FoodRecognitionResponse(log=log, conversation_id=conversation.id)
```

Keep existing exception handling, and if there is already a `return FoodRecognitionResponse(log=log)`, replace it with the block above.

- [ ] **Step 6: Run food tests**

Run:

```bash
cd backend
pytest tests/test_nutrition.py -v
```

Expected: pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add backend/app/schemas/nutrition.py backend/app/api/routes/nutrition.py backend/app/services/ai_service.py backend/tests/test_nutrition.py
git commit -m "feat: persist food recognition conversations"
```

## Task 5: Frontend API Client and Modal Component

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/components/AiConversationModal.tsx`

- [ ] **Step 1: Add client types and APIs**

Modify `frontend/src/api/client.ts` by adding types near AI plan types:

```ts
export type AiConversationMessage = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | string;
  content: string;
  provider_type: string | null;
  model_name: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

export type AiConversationSummary = {
  id: number;
  user_id: number;
  topic: "training_plan" | "nutrition_plan" | "food_record" | string;
  training_plan_id: number | null;
  nutrition_plan_id: number | null;
  title: string;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type AiConversationDetail = AiConversationSummary & {
  messages: AiConversationMessage[];
};

export type AiConversationQuery = {
  topic?: string;
  trainingPlanId?: number | null;
  nutritionPlanId?: number | null;
};
```

Add functions:

```ts
export function fetchAiConversations(query: AiConversationQuery) {
  const params = new URLSearchParams();
  if (query.topic) params.set("topic", query.topic);
  if (query.trainingPlanId) params.set("training_plan_id", String(query.trainingPlanId));
  if (query.nutritionPlanId) params.set("nutrition_plan_id", String(query.nutritionPlanId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<AiConversationSummary[]>(`/ai-conversations${suffix}`);
}

export function fetchAiConversation(conversationId: number) {
  return apiRequest<AiConversationDetail>(`/ai-conversations/${conversationId}`);
}
```

Update AI call functions:

```ts
export function generateNutritionPlan(prompt: string, conversationId?: number | null) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    "/ai-coach/nutrition-plans/generate",
    {
      method: "POST",
      body: JSON.stringify({ prompt, conversation_id: conversationId || undefined }),
    },
  );
}

export function adjustNutritionPlan(
  planId: number,
  prompt: string,
  conversationId?: number | null,
) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    `/ai-coach/nutrition-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ prompt, conversation_id: conversationId || undefined }),
    },
  );
}

export function generateAiTrainingPlan(
  prompt: string,
  title?: string,
  conversationId?: number | null,
) {
  return apiRequest<AiTrainingPlanResponse>("/ai-coach/training-plans/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      title: title || undefined,
      conversation_id: conversationId || undefined,
    }),
  });
}

export function adjustAiTrainingPlan(
  planId: number,
  message: string,
  targetDate?: string,
  conversationId?: number | null,
) {
  return apiRequest<AiTrainingPlanResponse>(
    `/ai-coach/training-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        target_date: targetDate,
        conversation_id: conversationId || undefined,
      }),
    },
  );
}
```

Change `recognizeFood` return type:

```ts
export function recognizeFood(formData: FormData) {
  return apiRequest<{ log: NutritionLog; conversation_id: number }>(
    "/nutrition/recognize",
    {
      method: "POST",
      body: formData,
    },
  );
}
```

- [ ] **Step 2: Create reusable modal**

Create `frontend/src/components/AiConversationModal.tsx`:

```tsx
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Bot, Plus, Send, X } from "lucide-react";

import {
  AiConversationDetail,
  AiConversationSummary,
  fetchAiConversation,
  fetchAiConversations,
} from "../api/client";

type ConversationMode = "history" | "new";

type Props = {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  topic: string;
  trainingPlanId?: number | null;
  nutritionPlanId?: number | null;
  defaultPrompt?: string;
  extraFields?: ReactNode;
  sendLabel?: string;
  loadingLabel?: string;
  onClose: () => void;
  onSend: (payload: {
    message: string;
    conversationId: number | null;
    mode: ConversationMode;
  }) => Promise<number | null | void>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readableContent(content: string) {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.title === "string") return parsed.title;
    if (Array.isArray(parsed.items)) return `已返回 ${parsed.items.length} 项结果`;
    if (typeof parsed.food_name === "string") return parsed.food_name;
  } catch {
    return content;
  }
  return content;
}

export default function AiConversationModal({
  isOpen,
  title,
  subtitle,
  topic,
  trainingPlanId,
  nutritionPlanId,
  defaultPrompt = "",
  extraFields,
  sendLabel = "发送",
  loadingLabel = "AI 正在处理",
  onClose,
  onSend,
}: Props) {
  const [mode, setMode] = useState<ConversationMode>("history");
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AiConversationDetail | null>(null);
  const [message, setMessage] = useState(defaultPrompt);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMessage(defaultPrompt);
    setError(null);
    void fetchAiConversations({ topic, trainingPlanId, nutritionPlanId })
      .then((next) => {
        setConversations(next);
        if (next.length > 0) {
          setMode("history");
          setActiveConversationId(next[0].id);
        } else {
          setMode("new");
          setActiveConversationId(null);
          setDetail(null);
        }
      })
      .catch((caught) => {
        setMode("new");
        setError(caught instanceof Error ? caught.message : "AI 对话读取失败");
      });
  }, [defaultPrompt, isOpen, nutritionPlanId, topic, trainingPlanId]);

  useEffect(() => {
    if (!isOpen || mode !== "history" || !activeConversationId) return;
    void fetchAiConversation(activeConversationId)
      .then(setDetail)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "AI 对话读取失败"),
      );
  }, [activeConversationId, isOpen, mode]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const nextConversationId = await onSend({
        message: message.trim(),
        conversationId: mode === "history" ? activeConversationId : null,
        mode,
      });
      if (nextConversationId) {
        setActiveConversationId(nextConversationId);
      }
      setMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 请求失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-soft sm:mx-auto sm:max-w-3xl sm:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <button
            aria-label="关闭"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
            disabled={isLoading}
            onClick={onClose}
            title="关闭"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1">
          <button
            className={[
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
              mode === "history" ? "bg-gym-teal text-white" : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            disabled={isLoading || conversations.length === 0}
            onClick={() => setMode("history")}
            type="button"
          >
            <Bot aria-hidden="true" size={16} />
            历史续聊
          </button>
          <button
            className={[
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
              mode === "new" ? "bg-gym-teal text-white" : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            disabled={isLoading}
            onClick={() => {
              setMode("new");
              setDetail(null);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            新建对话
          </button>
        </div>

        {mode === "history" ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={[
                  "min-w-44 rounded-md border px-3 py-2 text-left text-sm transition disabled:opacity-60",
                  activeConversationId === conversation.id
                    ? "border-gym-teal bg-gym-mint text-gym-teal"
                    : "border-slate-200 text-slate-600 hover:border-gym-teal",
                ].join(" ")}
                disabled={isLoading}
                onClick={() => setActiveConversationId(conversation.id)}
                type="button"
              >
                <span className="block truncate font-semibold">{conversation.title}</span>
                <span className="mt-1 block text-xs">{formatDate(conversation.updated_at)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 min-h-72 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {mode === "new" ? (
            <p className="text-sm text-slate-500">输入第一条消息创建新对话。</p>
          ) : null}
          {mode === "history" && detail
            ? detail.messages.map((item) => (
                <div
                  key={item.id}
                  className={[
                    "mb-3 max-w-[82%] rounded-md px-3 py-2 text-sm leading-6",
                    item.role === "assistant"
                      ? "ml-auto bg-gym-teal text-white"
                      : "bg-white text-slate-700",
                  ].join(" ")}
                >
                  {readableContent(item.content)}
                </div>
              ))
            : null}
          {isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-gym-teal" />
              {loadingLabel}
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          {extraFields}
          <label className="block text-sm font-medium text-slate-700">
            消息
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              disabled={isLoading}
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isLoading || !message.trim()}
            type="submit"
          >
            <Send aria-hidden="true" size={17} />
            {isLoading ? loadingLabel : sendLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add frontend/src/api/client.ts frontend/src/components/AiConversationModal.tsx
git commit -m "feat: add ai conversation modal client"
```

## Task 6: Frontend Training Plan Modal Integration

**Files:**
- Modify: `frontend/src/pages/user/TrainingPlansPage.tsx`

- [ ] **Step 1: Replace inline global AI state with modal state**

In `TrainingPlansPage.tsx`, import modal:

```ts
import AiConversationModal from "../../components/AiConversationModal";
```

Replace:

```ts
const [globalAiOpen, setGlobalAiOpen] = useState(false);
```

with:

```ts
const [aiDialog, setAiDialog] = useState<{
  targetDate: string | null;
  defaultPrompt: string;
} | null>(null);
```

- [ ] **Step 2: Replace AI button open behavior**

Change top-level AI button `onClick`:

```tsx
onClick={() =>
  setAiDialog({
    targetDate: null,
    defaultPrompt: globalPrompt,
  })
}
```

- [ ] **Step 3: Remove inline global AI panel JSX**

Delete the conditional `globalAiOpen ? (...) : null` block.

- [ ] **Step 4: Replace date AI inline section with modal opener**

In the date edit area, remove the `AI 对话` textarea block and replace with:

```tsx
<button
  className="mt-5 inline-flex items-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
  disabled={selectedIsPast}
  onClick={() =>
    setAiDialog({
      targetDate: selectedDate,
      defaultPrompt: dateAiPrompt || `调整 ${formatDateTitle(selectedDate)} 的训练安排`,
    })
  }
  type="button"
>
  <Bot aria-hidden="true" size={17} />
  AI 对话
</button>
```

- [ ] **Step 5: Add modal send handler**

Replace or adapt `handleGlobalAi` and `handleDateAiAdjust` into:

```ts
async function handleTrainingAiSend({
  message,
  conversationId,
}: {
  message: string;
  conversationId: number | null;
}) {
  const targetDate = aiDialog?.targetDate ?? null;
  if (!message.trim()) return null;
  if (targetDate && targetDate < todayKey) {
    throw new Error("过去日期不可修改");
  }
  if (activePlan) {
    const requestMessage = targetDate
      ? message
      : [
          `今天是 ${todayKey}，不要修改今天之前的计划。`,
          "如果用户没有指定跨度，默认从今天向后生成总共 7 天计划。",
          `用户描述：${message}`,
        ].join("\n");
    const response = await adjustAiTrainingPlan(
      activePlan.id,
      requestMessage,
      targetDate ?? undefined,
      conversationId,
    );
    syncDetail(response.plan);
    await loadPlan(response.plan.id);
    setAiDialog(null);
    setStatus("AI 已更新训练计划");
    return response.conversation_id;
  }
  const response = await generateAiTrainingPlan(
    [
      `今天是 ${todayKey}。`,
      "如果用户没有指定跨度，默认从今天向后生成总共 7 天计划。",
      `用户描述：${message}`,
    ].join("\n"),
    "我的训练课表",
    conversationId,
  );
  syncDetail(response.plan);
  await loadPlan(response.plan.id);
  setAiDialog(null);
  setStatus("AI 已更新训练计划");
  return response.conversation_id;
}
```

- [ ] **Step 6: Render modal at page bottom**

Add before closing `</section>`:

```tsx
<AiConversationModal
  isOpen={aiDialog !== null}
  title="AI 训练计划"
  subtitle={aiDialog?.targetDate ? formatDateTitle(aiDialog.targetDate) : "全局训练计划"}
  topic="training_plan"
  trainingPlanId={activePlan?.id ?? null}
  defaultPrompt={aiDialog?.defaultPrompt ?? ""}
  sendLabel="发送"
  loadingLabel="AI 正在更新训练计划"
  onClose={() => setAiDialog(null)}
  onSend={({ message, conversationId }) =>
    handleTrainingAiSend({ message, conversationId })
  }
/>
```

- [ ] **Step 7: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/pages/user/TrainingPlansPage.tsx
git commit -m "feat: use ai conversation modal for training plans"
```

## Task 7: Frontend Nutrition and Food Record Integration

**Files:**
- Modify: `frontend/src/pages/user/NutritionPage.tsx`

- [ ] **Step 1: Import modal and message icon**

Add:

```ts
import AiConversationModal from "../../components/AiConversationModal";
```

Keep existing icons and add `Bot` if needed:

```ts
  Bot,
```

- [ ] **Step 2: Replace plan dialog state**

Replace:

```ts
const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
```

with:

```ts
const [planAiOpen, setPlanAiOpen] = useState(false);
const [foodAiOpen, setFoodAiOpen] = useState(false);
```

- [ ] **Step 3: Simplify record state**

Keep `manualForm` as the single record form. Remove `recordMode` usage from JSX. Keep `recognitionForm` for the AI modal fields.

- [ ] **Step 4: Add nutrition plan modal send handler**

Add:

```ts
async function handleNutritionPlanAiSend({
  message,
  conversationId,
}: {
  message: string;
  conversationId: number | null;
}) {
  if (!message.trim()) return null;
  const response = activePlan
    ? await adjustNutritionPlan(activePlan.id, message.trim(), conversationId)
    : await generateNutritionPlan(message.trim(), conversationId);
  setActivePlan(response.plan);
  setPlanAiOpen(false);
  setStatus(activePlan ? "饮食计划已调整" : "饮食计划已生成");
  await loadData();
  return response.conversation_id;
}
```

- [ ] **Step 5: Add food AI modal send handler**

Add:

```ts
async function handleFoodAiSend({
  message,
  conversationId,
}: {
  message: string;
  conversationId: number | null;
}) {
  if (!message.trim() && !recognitionForm.image) {
    throw new Error("需要图片或文字描述");
  }
  const formData = new FormData();
  formData.append("meal_type", manualForm.meal_type);
  formData.append("logged_at", new Date(manualForm.logged_at).toISOString());
  if (message.trim()) {
    formData.append("description", message.trim());
  }
  if (recognitionForm.image) {
    formData.append("image", recognitionForm.image);
  }
  if (conversationId) {
    formData.append("conversation_id", String(conversationId));
  }
  const response = await recognizeFood(formData);
  setStatus(`已保存 ${response.log.food_name}`);
  setEditingLogId(response.log.id);
  setCorrectionForm(correctionFromLog(response.log));
  setFoodAiOpen(false);
  closeRecordDialog();
  await loadData();
  return response.conversation_id;
}
```

- [ ] **Step 6: Replace nutrition plan AI button**

Change `AI 生成` button label to `AI 对话` and `onClick={() => setPlanAiOpen(true)}`.

- [ ] **Step 7: Remove old `isPlanDialogOpen` JSX**

Delete the old AI 饮食计划 modal block.

- [ ] **Step 8: Replace record mode toggle and recognize form**

Inside `recordDialog` modal:

- Remove the two-button `AI 识别` / `手动输入` segmented control.
- Remove conditional `recordMode === "recognize"` branch.
- Always render the manual form fields using `manualForm`.
- Add an AI button above the manual save button:

```tsx
<button
  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
  disabled={isSaving}
  type="button"
  onClick={() => {
    setRecognitionForm((current) => ({
      ...current,
      logged_at: manualForm.logged_at,
      meal_type: manualForm.meal_type,
      description: manualForm.description,
    }));
    setFoodAiOpen(true);
  }}
>
  <Bot aria-hidden="true" size={17} />
  AI 识别
</button>
```

Keep manual save button:

```tsx
<button
  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
  disabled={isSaving}
  type="submit"
>
  <Save aria-hidden="true" size={17} />
  保存记录
</button>
```

- [ ] **Step 9: Render plan and food AI modals**

Add before closing `</section>`:

```tsx
<AiConversationModal
  isOpen={planAiOpen}
  title="AI 饮食计划"
  subtitle={activePlan ? `${activePlan.title} · v${activePlan.current_version}` : "生成新的饮食计划"}
  topic="nutrition_plan"
  nutritionPlanId={activePlan?.id ?? null}
  defaultPrompt={activePlan ? adjustPrompt || "调整当前饮食计划" : planPrompt}
  sendLabel="发送"
  loadingLabel="AI 正在更新饮食计划"
  onClose={() => setPlanAiOpen(false)}
  onSend={({ message, conversationId }) =>
    handleNutritionPlanAiSend({ message, conversationId })
  }
/>

<AiConversationModal
  isOpen={foodAiOpen}
  title="AI 食物识别"
  subtitle="上传图片或输入描述，识别结果会写入记录列表"
  topic="food_record"
  defaultPrompt={recognitionForm.description}
  sendLabel="识别并保存"
  loadingLabel="AI 正在识别食物"
  extraFields={
    <label className="block text-sm font-medium text-slate-700">
      图片
      <input
        key={fileInputKey}
        accept="image/*"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gym-mint file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gym-teal"
        disabled={isSaving}
        type="file"
        onChange={(event) =>
          setRecognitionForm((current) => ({
            ...current,
            image: event.target.files?.[0] ?? null,
          }))
        }
      />
    </label>
  }
  onClose={() => setFoodAiOpen(false)}
  onSend={({ message, conversationId }) =>
    handleFoodAiSend({ message, conversationId })
  }
/>
```

- [ ] **Step 10: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: pass.

- [ ] **Step 11: Commit**

Run:

```bash
git add frontend/src/pages/user/NutritionPage.tsx
git commit -m "feat: add nutrition ai conversation flows"
```

## Task 8: Frontend Pose Loading and AI Settings

**Files:**
- Modify: `frontend/src/pages/user/PoseDetectionPage.tsx`
- Modify: `frontend/src/pages/user/AiProviderSettingsPage.tsx`

- [ ] **Step 1: Add pose loading animation**

In `PoseDetectionPage.tsx`, change the AI advice button content:

```tsx
{isAdviceLoading ? (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gym-teal/30 border-t-gym-teal" />
) : (
  <Sparkles aria-hidden="true" size={17} />
)}
{isAdviceLoading ? "生成中" : "AI 建议"}
```

- [ ] **Step 2: Rewrite AI Provider settings as single-form page**

In `AiProviderSettingsPage.tsx`:

- Remove `configs.map` list and `editingId` UI concept.
- Keep `configs` or replace with `config`.
- On `loadConfigs`, use first config:

```ts
const nextConfigs = await fetchAiProviderConfigs();
const active = nextConfigs[0] ?? null;
setConfig(active);
if (active) {
  setForm({
    provider_type: active.provider_type,
    base_url: active.base_url ?? "",
    model_name: active.model_name,
    api_key: "",
    is_active: active.is_active,
  });
} else {
  setForm(emptyForm);
}
```

- In submit:

```ts
if (config) {
  await updateAiProviderConfig(config.id, payload);
  setStatus("配置已保存");
} else {
  if (!form.api_key) {
    setError("新配置需要 API Key");
    return;
  }
  await createAiProviderConfig({ ...payload, api_key: form.api_key });
  setStatus("配置已创建");
}
await loadConfigs();
```

- Change heading to `AI 配置`.
- Change API key placeholder to `留空则保留原密钥`.
- Show delete button as secondary only when `config` exists:

```tsx
{config ? (
  <button
    className="rounded-md border border-red-200 px-4 py-2 font-semibold text-red-600"
    onClick={() => void handleDelete(config.id)}
    type="button"
  >
    删除配置
  </button>
) : null}
```

- [ ] **Step 3: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add frontend/src/pages/user/PoseDetectionPage.tsx frontend/src/pages/user/AiProviderSettingsPage.tsx
git commit -m "feat: refine ai settings and pose loading"
```

## Task 9: Full Verification and Dev Servers

**Files:**
- No planned file edits.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd backend
pytest tests/test_ai_conversations.py tests/test_ai_coach_training_plans.py tests/test_nutrition_plans.py tests/test_nutrition.py tests/test_ai_provider_configs.py tests/test_pose_detection.py -v
```

Expected: pass.

- [ ] **Step 2: Run frontend tests/build**

Run:

```bash
cd frontend
npm run test
npm run build
```

Expected: both pass.

- [ ] **Step 3: Start backend**

Run from repo root:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Expected: server stays running and logs Uvicorn startup.

- [ ] **Step 4: Start frontend**

Run from repo root in a second terminal/session:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite reports local URL `http://127.0.0.1:5173/`.

- [ ] **Step 5: Manual smoke checklist**

Open `http://127.0.0.1:5173/` and verify:

- AI settings page shows one populated form after creating a config, with API key blank.
- Training page AI button opens modal with `历史续聊` and `新建对话`.
- Training AI request shows loading and closes after success.
- Nutrition plan AI request shows loading and closes after success.
- Food record modal has one `记录` form, manual save works, AI 识别 opens modal, shows loading, then refreshes list and correction form.
- Pose `AI 建议` button shows inline spinner while loading.

- [ ] **Step 6: Commit any verification fixes**

If verification required fixes, commit them:

```bash
git add backend/app frontend/src
git commit -m "fix: complete ai conversation verification"
```

Before running this command, replace the broad paths with the exact files changed during verification if only a small subset changed. If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: Tasks cover backend history/detail, explicit continuation, food recognition conversation persistence, reusable modal, training/nutrition/food UI, pose loading, AI settings, tests, and dev servers.
- Placeholder scan: No `TBD`, `TODO`, or unspecified “add tests” steps remain.
- Type consistency: `conversation_id` is backend payload/response naming; frontend converts to `conversationId` internally and serializes back to `conversation_id`.
