# 智慧健身房第 4 期动作检测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现第 4 期动作检测闭环：前端 MediaPipe 姿态检测入口、检测结果私有保存、历史报告读取，以及基于当前用户 AI Provider 配置生成动作改进建议。

**Architecture:** 后端继续沿用 FastAPI 单体分层结构，新增 `pose_detection_results` 私有表和 `/api/pose` 路由，检测结果按 `user_id` 强制隔离，可关联训练记录、动作库和运动模式。前端新增 `/app/pose` 页面，使用 `@mediapipe/tasks-vision` 在浏览器端做实时姿态检测、基础计数和评分；保存时先写入普通训练记录，再保存检测结果摘要。AI 动作建议复用现有用户级 AI Provider 配置，只把动作检测摘要传给模型。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy 2.x、Alembic、PostgreSQL、pytest、React、Vite、TypeScript、Tailwind CSS、React Router、lucide-react、@mediapipe/tasks-vision、Vitest。

---

## 范围说明

本计划只实现规格中的第 4 期：

- 前端 MediaPipe 动作检测。
- 所有训练入口可进入动作检测。
- 后端保存动作检测结果。
- 后端按当前用户读取检测结果。
- 基于检测结果生成 AI 动作建议。
- 摄像头或动作检测失败时，保留现有手动训练记录流程。

本计划不实现第 5 期食物识别、营养日志、手环数据模型和模拟心率导入。

对应规格文档：

- `docs/superpowers/specs/2026-06-05-smart-gym-design.md`
- `docs/superpowers/plans/2026-06-05-smart-gym-phase-1-platform.md`
- `docs/superpowers/plans/2026-06-06-smart-gym-phase-2-training-leaderboard.md`
- `docs/superpowers/plans/2026-06-06-smart-gym-phase-3-ai-training-plans.md`

## 目标文件结构

```text
backend/
  app/
    api/
      router.py
      routes/
        pose.py
    models/
      __init__.py
      pose_detection_result.py
    schemas/
      pose.py
    services/
      ai_service.py
      pose_service.py
    migrations/
      versions/
        20260607_phase4_pose_detection.py
  tests/
    conftest.py
    test_phase4_models.py
    test_pose_detection.py
frontend/
  package.json
  package-lock.json
  src/
    api/client.ts
    pose/
      mediapipe.ts
      poseMetrics.test.ts
      poseMetrics.ts
    pages/
      user/
        HomePage.tsx
        PoseDetectionPage.tsx
        TrainingPage.tsx
        TrainingPlansPage.tsx
    routes/
      UserRoutes.tsx
```

## Data Contracts

`PoseDetectionResult`:

- `id: int`
- `user_id: int`
- `workout_session_id: int | None`
- `exercise_id: int | None`
- `workout_mode_id: int | None`
- `started_at: datetime`
- `ended_at: datetime | None`
- `duration_seconds: int`
- `reps_counted: int`
- `score: float | None`
- `feedback_summary: str | None`
- `metrics_json: dict`
- `landmarks_sample_json: dict | None`
- `ai_advice: str | None`
- `ai_provider_type: str | None`
- `ai_model_name: str | None`
- `ai_generated_at: datetime | None`
- `created_at: datetime`

`POST /api/pose/results` request:

```json
{
  "workout_session_id": 1,
  "exercise_id": 1,
  "workout_mode_id": null,
  "started_at": "2026-06-07T08:00:00Z",
  "ended_at": "2026-06-07T08:02:30Z",
  "duration_seconds": 150,
  "reps_counted": 12,
  "score": 82.5,
  "feedback_summary": "下蹲深度稳定，起身阶段膝盖轻微内扣。",
  "metrics_json": {
    "source": "mediapipe_pose_landmarker",
    "snapshots": []
  },
  "landmarks_sample_json": {
    "frames": []
  }
}
```

`POST /api/pose/results/{result_id}/ai-advice` response:

```json
{
  "result": {
    "id": 1,
    "user_id": 1,
    "workout_session_id": 1,
    "exercise_id": 1,
    "workout_mode_id": null,
    "started_at": "2026-06-07T08:00:00",
    "ended_at": "2026-06-07T08:02:30",
    "duration_seconds": 150,
    "reps_counted": 12,
    "score": 82.5,
    "feedback_summary": "下蹲深度稳定，起身阶段膝盖轻微内扣。",
    "metrics_json": {
      "source": "mediapipe_pose_landmarker",
      "snapshots": []
    },
    "landmarks_sample_json": {
      "frames": []
    },
    "ai_advice": "动作建议：保持膝盖朝脚尖方向，下一组降低速度并控制起身节奏。",
    "ai_provider_type": "openai-compatible",
    "ai_model_name": "test-model",
    "ai_generated_at": "2026-06-07T08:03:00",
    "created_at": "2026-06-07T08:02:31"
  }
}
```

## Task 1: 后端动作检测数据模型与迁移

**Files:**
- Create: `backend/app/models/pose_detection_result.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_phase4_models.py`
- Create: `backend/app/migrations/versions/20260607_phase4_pose_detection.py`

- [ ] **Step 1: Write the failing model test**

Create `backend/tests/test_phase4_models.py`:

```python
from datetime import datetime

from app.models.pose_detection_result import PoseDetectionResult
from app.models.user import User


def test_pose_detection_result_model_persists_private_metrics(db_session):
    user = User(
        email="pose-model@example.com",
        display_name="pose-model",
        hashed_password="hashed",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = PoseDetectionResult(
        user_id=user.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        ended_at=datetime(2026, 6, 7, 8, 2, 0),
        duration_seconds=120,
        reps_counted=10,
        score=84.5,
        feedback_summary="膝盖轨迹稳定",
        metrics_json={"source": "mediapipe_pose_landmarker"},
        landmarks_sample_json={"frames": [{"landmarks": 33}]},
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    assert result.id is not None
    assert result.user_id == user.id
    assert result.reps_counted == 10
    assert result.metrics_json["source"] == "mediapipe_pose_landmarker"
    assert result.ai_advice is None
```

- [ ] **Step 2: Run the model test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_phase4_models.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.pose_detection_result'`.

- [ ] **Step 3: Add the model**

Create `backend/app/models/pose_detection_result.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PoseDetectionResult(Base):
    __tablename__ = "pose_detection_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    workout_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    exercise_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("exercise_library.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    workout_mode_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("workout_modes.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    reps_counted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feedback_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    landmarks_sample_json: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON, nullable=True
    )
    ai_advice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_provider_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    ai_model_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    ai_generated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
```

- [ ] **Step 4: Export and load the model in tests**

Modify `backend/app/models/__init__.py`:

```python
from app.models.ai_provider_config import AiProviderConfig
from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.models.exercise import Exercise
from app.models.leaderboard_refresh_state import LeaderboardRefreshState
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.pose_detection_result import PoseDetectionResult
from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession

__all__ = [
    "AiConversation",
    "AiMessage",
    "AiProviderConfig",
    "Exercise",
    "LeaderboardRefreshState",
    "LeaderboardSnapshot",
    "PoseDetectionResult",
    "TrainingPlan",
    "TrainingPlanItem",
    "TrainingPlanVersion",
    "User",
    "UserProfile",
    "WorkoutMode",
    "WorkoutSession",
]
```

Modify `backend/tests/conftest.py` by adding the import and `_models` entry:

```python
from app.models.pose_detection_result import PoseDetectionResult
```

```python
_models = (
    AiConversation,
    AiMessage,
    AiProviderConfig,
    Exercise,
    LeaderboardRefreshState,
    LeaderboardSnapshot,
    PoseDetectionResult,
    TrainingPlan,
    TrainingPlanItem,
    TrainingPlanVersion,
    User,
    UserProfile,
    WorkoutMode,
    WorkoutSession,
)
```

- [ ] **Step 5: Add the Alembic migration**

Create `backend/app/migrations/versions/20260607_phase4_pose_detection.py`:

```python
"""phase 4 pose detection

Revision ID: 20260607_phase4_pose
Revises: 20260606_phase3_ai_plans
Create Date: 2026-06-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260607_phase4_pose"
down_revision: Union[str, Sequence[str], None] = "20260606_phase3_ai_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pose_detection_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("workout_session_id", sa.Integer(), nullable=True),
        sa.Column("exercise_id", sa.Integer(), nullable=True),
        sa.Column("workout_mode_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("reps_counted", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback_summary", sa.Text(), nullable=True),
        sa.Column("metrics_json", sa.JSON(), nullable=False),
        sa.Column("landmarks_sample_json", sa.JSON(), nullable=True),
        sa.Column("ai_advice", sa.Text(), nullable=True),
        sa.Column("ai_provider_type", sa.String(length=80), nullable=True),
        sa.Column("ai_model_name", sa.String(length=160), nullable=True),
        sa.Column("ai_generated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise_library.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workout_mode_id"], ["workout_modes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workout_session_id"], ["workout_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pose_detection_results_id"), "pose_detection_results", ["id"])
    op.create_index(
        op.f("ix_pose_detection_results_user_id"),
        "pose_detection_results",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_pose_detection_results_workout_session_id"),
        "pose_detection_results",
        ["workout_session_id"],
    )
    op.create_index(
        op.f("ix_pose_detection_results_exercise_id"),
        "pose_detection_results",
        ["exercise_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_pose_detection_results_exercise_id"), table_name="pose_detection_results")
    op.drop_index(op.f("ix_pose_detection_results_workout_session_id"), table_name="pose_detection_results")
    op.drop_index(op.f("ix_pose_detection_results_user_id"), table_name="pose_detection_results")
    op.drop_index(op.f("ix_pose_detection_results_id"), table_name="pose_detection_results")
    op.drop_table("pose_detection_results")
```

- [ ] **Step 6: Run the model test to verify it passes**

Run:

```bash
cd backend
pytest tests/test_phase4_models.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/pose_detection_result.py backend/app/models/__init__.py backend/tests/conftest.py backend/tests/test_phase4_models.py backend/app/migrations/versions/20260607_phase4_pose_detection.py
git commit -m "feat: add pose detection result model"
```

## Task 2: 后端检测结果保存与读取 API

**Files:**
- Create: `backend/app/schemas/pose.py`
- Create: `backend/app/services/pose_service.py`
- Create: `backend/app/api/routes/pose.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_pose_detection.py`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/test_pose_detection.py`:

```python
from datetime import datetime

from app.models.exercise import Exercise
from app.models.pose_detection_result import PoseDetectionResult
from app.models.workout_session import WorkoutSession


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _published_exercise(db_session) -> Exercise:
    exercise = Exercise(
        slug="bodyweight-squat",
        name="徒手深蹲",
        target_muscle="腿部",
        difficulty="beginner",
        detection_rules={"type": "squat", "bottom_angle": 115, "top_angle": 155},
        is_published=True,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)
    return exercise


def _pose_payload(exercise_id: int | None = None, workout_session_id: int | None = None):
    return {
        "workout_session_id": workout_session_id,
        "exercise_id": exercise_id,
        "workout_mode_id": None,
        "started_at": "2026-06-07T08:00:00",
        "ended_at": "2026-06-07T08:02:00",
        "duration_seconds": 120,
        "reps_counted": 10,
        "score": 84.5,
        "feedback_summary": "膝盖轨迹稳定",
        "metrics_json": {"source": "mediapipe_pose_landmarker"},
        "landmarks_sample_json": {"frames": []},
    }


def test_user_can_create_and_list_own_pose_detection_results(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("pose-owner@example.com", role="user")
    exercise = _published_exercise(db_session)

    create_response = client.post(
        "/api/pose/results",
        headers=_auth(token),
        json=_pose_payload(exercise_id=exercise.id),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["exercise_id"] == exercise.id
    assert created["reps_counted"] == 10
    assert created["metrics_json"]["source"] == "mediapipe_pose_landmarker"

    list_response = client.get("/api/pose/results", headers=_auth(token))

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == created["id"]


def test_user_cannot_read_other_users_pose_detection_results(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("pose-private-owner@example.com", role="user")
    _, viewer_token = create_user_and_token("pose-private-viewer@example.com", role="user")
    result = PoseDetectionResult(
        user_id=owner.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        duration_seconds=90,
        reps_counted=8,
        score=80,
        metrics_json={"source": "test"},
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    response = client.get(f"/api/pose/results/{result.id}", headers=_auth(viewer_token))

    assert response.status_code == 404


def test_create_pose_result_rejects_user_id_override(client, create_user_and_token):
    _, token = create_user_and_token("pose-no-user-id@example.com", role="user")
    payload = _pose_payload()
    payload["user_id"] = 999

    response = client.post("/api/pose/results", headers=_auth(token), json=payload)

    assert response.status_code == 422


def test_create_pose_result_rejects_cross_user_workout_session(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("pose-session-owner@example.com", role="user")
    _, viewer_token = create_user_and_token("pose-session-viewer@example.com", role="user")
    session = WorkoutSession(
        user_id=owner.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        duration_minutes=30,
        calories_burned=100,
        status="completed",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    response = client.post(
        "/api/pose/results",
        headers=_auth(viewer_token),
        json=_pose_payload(workout_session_id=session.id),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workout session not found"


def test_create_pose_result_rejects_unpublished_exercise(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("pose-draft-exercise@example.com", role="user")
    exercise = Exercise(
        slug="draft-pose-exercise",
        name="Draft Pose Exercise",
        target_muscle="全身",
        difficulty="beginner",
        is_published=False,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)

    response = client.post(
        "/api/pose/results",
        headers=_auth(token),
        json=_pose_payload(exercise_id=exercise.id),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Exercise not found"
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_pose_detection.py -v
```

Expected: FAIL with 404 responses for `/api/pose/results`.

- [ ] **Step 3: Add pose schemas**

Create `backend/app/schemas/pose.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class PoseDetectionResultCreate(BaseModel):
    workout_session_id: Optional[int] = Field(default=None, ge=1)
    exercise_id: Optional[int] = Field(default=None, ge=1)
    workout_mode_id: Optional[int] = Field(default=None, ge=1)
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_seconds: int = Field(ge=1, le=86_400)
    reps_counted: int = Field(ge=0, le=100_000)
    score: Optional[float] = Field(default=None, ge=0, le=100)
    feedback_summary: Optional[str] = Field(default=None, max_length=2_000)
    metrics_json: dict[str, Any] = Field(default_factory=dict)
    landmarks_sample_json: Optional[dict[str, Any]] = None

    model_config = ConfigDict(extra="forbid")


class PoseDetectionResultResponse(PoseDetectionResultCreate):
    id: int
    user_id: int
    ai_advice: Optional[str] = None
    ai_provider_type: Optional[str] = None
    ai_model_name: Optional[str] = None
    ai_generated_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PoseAdviceResponse(BaseModel):
    result: PoseDetectionResultResponse
```

- [ ] **Step 4: Add pose service**

Create `backend/app/services/pose_service.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.ai_provider_config import AiProviderConfig
from app.models.exercise import Exercise
from app.models.pose_detection_result import PoseDetectionResult
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession
from app.schemas.pose import PoseDetectionResultCreate


def _published_exercise(db: Session, exercise_id: int) -> Optional[Exercise]:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not exercise.is_published:
        return None
    return exercise


def _active_workout_mode(db: Session, workout_mode_id: int) -> Optional[WorkoutMode]:
    workout_mode = db.get(WorkoutMode, workout_mode_id)
    if workout_mode is None or not workout_mode.is_active:
        return None
    return workout_mode


def create_pose_detection_result(
    db: Session, user_id: int, payload: PoseDetectionResultCreate
) -> PoseDetectionResult:
    exercise_id = payload.exercise_id
    workout_mode_id = payload.workout_mode_id

    if payload.workout_session_id is not None:
        workout_session = db.get(WorkoutSession, payload.workout_session_id)
        if workout_session is None or workout_session.user_id != user_id:
            raise ValueError("Workout session not found")
        exercise_id = exercise_id if exercise_id is not None else workout_session.exercise_id
        workout_mode_id = (
            workout_mode_id
            if workout_mode_id is not None
            else workout_session.workout_mode_id
        )

    if exercise_id is not None and _published_exercise(db, exercise_id) is None:
        raise ValueError("Exercise not found")

    if workout_mode_id is not None and _active_workout_mode(db, workout_mode_id) is None:
        raise ValueError("Workout mode not found")

    data = payload.model_dump()
    data["exercise_id"] = exercise_id
    data["workout_mode_id"] = workout_mode_id
    result = PoseDetectionResult(user_id=user_id, **data)
    db.add(result)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Pose detection result could not be saved") from exc
    db.refresh(result)
    return result


def list_pose_detection_results(db: Session, user_id: int) -> list[PoseDetectionResult]:
    statement = (
        select(PoseDetectionResult)
        .where(PoseDetectionResult.user_id == user_id)
        .order_by(desc(PoseDetectionResult.started_at), desc(PoseDetectionResult.id))
    )
    return list(db.execute(statement).scalars())


def get_pose_detection_result(
    db: Session, user_id: int, result_id: int
) -> Optional[PoseDetectionResult]:
    statement = select(PoseDetectionResult).where(
        PoseDetectionResult.id == result_id,
        PoseDetectionResult.user_id == user_id,
    )
    return db.execute(statement).scalars().first()


def get_pose_result_exercise(
    db: Session, result: PoseDetectionResult
) -> Optional[Exercise]:
    if result.exercise_id is None:
        return None
    return db.get(Exercise, result.exercise_id)


def save_pose_advice(
    db: Session,
    result: PoseDetectionResult,
    config: AiProviderConfig,
    advice: str,
) -> PoseDetectionResult:
    result.ai_advice = advice
    result.ai_provider_type = config.provider_type
    result.ai_model_name = config.model_name
    result.ai_generated_at = datetime.utcnow()
    db.commit()
    db.refresh(result)
    return result
```

- [ ] **Step 5: Add pose routes and register them**

Create `backend/app/api/routes/pose.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.pose import (
    PoseAdviceResponse,
    PoseDetectionResultCreate,
    PoseDetectionResultResponse,
)
from app.services.pose_service import (
    create_pose_detection_result,
    get_pose_detection_result,
    list_pose_detection_results,
)

router = APIRouter()


@router.post(
    "/results",
    response_model=PoseDetectionResultResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_pose_detection_result(
    payload: PoseDetectionResultCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseDetectionResultResponse:
    try:
        return create_pose_detection_result(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/results", response_model=list[PoseDetectionResultResponse])
def list_my_pose_detection_results(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PoseDetectionResultResponse]:
    return list_pose_detection_results(db, current_user.id)


@router.get("/results/{result_id}", response_model=PoseDetectionResultResponse)
def get_my_pose_detection_result(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseDetectionResultResponse:
    result = get_pose_detection_result(db, current_user.id, result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pose detection result not found",
        )
    return result


@router.post("/results/{result_id}/ai-advice", response_model=PoseAdviceResponse)
def generate_my_pose_advice(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseAdviceResponse:
    result = get_pose_detection_result(db, current_user.id, result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pose detection result not found",
        )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Pose AI advice not implemented",
    )
```

Modify `backend/app/api/router.py`:

```python
from app.api.routes import (
    admin_content,
    ai_configs,
    ai_coach,
    auth,
    catalog,
    health,
    leaderboard,
    pose,
    training_plans,
    users,
    workouts,
)
```

```python
api_router.include_router(pose.router, prefix="/pose", tags=["pose"])
```

- [ ] **Step 6: Run API tests to verify save/list/get pass**

Run:

```bash
cd backend
pytest tests/test_pose_detection.py::test_user_can_create_and_list_own_pose_detection_results tests/test_pose_detection.py::test_user_cannot_read_other_users_pose_detection_results tests/test_pose_detection.py::test_create_pose_result_rejects_user_id_override tests/test_pose_detection.py::test_create_pose_result_rejects_cross_user_workout_session tests/test_pose_detection.py::test_create_pose_result_rejects_unpublished_exercise -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/pose.py backend/app/services/pose_service.py backend/app/api/routes/pose.py backend/app/api/router.py backend/tests/test_pose_detection.py
git commit -m "feat: add pose detection result api"
```

## Task 3: AI 动作建议

**Files:**
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/api/routes/pose.py`
- Modify: `backend/tests/test_pose_detection.py`

- [ ] **Step 1: Add failing AI advice tests**

Append to `backend/tests/test_pose_detection.py`:

```python
from app.models.ai_provider_config import AiProviderConfig
from app.services.ai_config_service import encrypt_api_key


def _provider(user_id: int, is_active: bool = True) -> AiProviderConfig:
    return AiProviderConfig(
        user_id=user_id,
        provider_type="openai-compatible",
        base_url="https://example.test/v1",
        model_name="test-model",
        api_key_encrypted=encrypt_api_key("test-key"),
        is_active=is_active,
    )


def test_pose_ai_advice_requires_current_user_provider_config(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    other_user, _ = create_user_and_token("pose-ai-other@example.com")
    user, token = create_user_and_token("pose-ai-current@example.com")
    db_session.add(_provider(other_user.id))
    db_session.add(
        PoseDetectionResult(
            user_id=user.id,
            started_at=datetime(2026, 6, 7, 8, 0, 0),
            duration_seconds=90,
            reps_counted=8,
            score=80,
            feedback_summary="深蹲幅度不足",
            metrics_json={"source": "test"},
        )
    )
    db_session.commit()
    result = db_session.query(PoseDetectionResult).filter_by(user_id=user.id).one()

    response = client.post(
        f"/api/pose/results/{result.id}/ai-advice",
        headers=_auth(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI provider config not found"


def test_pose_ai_advice_uses_current_user_provider_and_saves_result(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("pose-ai-save@example.com")
    db_session.add(_provider(user.id))
    db_session.add(
        PoseDetectionResult(
            user_id=user.id,
            started_at=datetime(2026, 6, 7, 8, 0, 0),
            duration_seconds=120,
            reps_counted=12,
            score=82.5,
            feedback_summary="起身阶段膝盖轻微内扣",
            metrics_json={"source": "mediapipe_pose_landmarker"},
        )
    )
    db_session.commit()
    result = db_session.query(PoseDetectionResult).filter_by(user_id=user.id).one()

    response = client.post(
        f"/api/pose/results/{result.id}/ai-advice",
        headers=_auth(token),
    )

    assert response.status_code == 200
    data = response.json()["result"]
    assert data["ai_advice"].startswith("动作建议：")
    assert data["ai_provider_type"] == "openai-compatible"
    assert data["ai_model_name"] == "test-model"
    assert data["ai_generated_at"] is not None
```

- [ ] **Step 2: Run AI advice tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_pose_detection.py::test_pose_ai_advice_requires_current_user_provider_config tests/test_pose_detection.py::test_pose_ai_advice_uses_current_user_provider_and_saves_result -v
```

Expected: first test FAIL with 501 instead of 400; second test FAIL with 501 instead of 200.

- [ ] **Step 3: Add AI advice generation**

Modify `backend/app/services/ai_service.py` by adding imports:

```python
from app.models.exercise import Exercise
from app.models.pose_detection_result import PoseDetectionResult
```

Add this code after `AI_PLAN_SYSTEM_PROMPT`:

```python
POSE_ADVICE_SYSTEM_PROMPT = (
    "You are a fitness movement coach. Return concise Chinese advice only. "
    "Use 3 short sentences at most. Focus on movement safety, one correction, "
    "and one next-set cue. Do not mention private data or provider metadata."
)
```

Add these functions before `generate_ai_training_plan`:

```python
def _fake_pose_advice(result: PoseDetectionResult) -> str:
    score_text = f"{result.score:.1f}" if result.score is not None else "未评分"
    return (
        f"动作建议：本次完成 {result.reps_counted} 次，评分 {score_text}。"
        "保持膝盖朝脚尖方向，起身时收紧核心。下一组放慢下放速度。"
    )


def _pose_advice_user_prompt(
    result: PoseDetectionResult, exercise: Optional[Exercise]
) -> str:
    exercise_name = exercise.name if exercise is not None else "未指定动作"
    return json.dumps(
        {
            "exercise_name": exercise_name,
            "duration_seconds": result.duration_seconds,
            "reps_counted": result.reps_counted,
            "score": result.score,
            "feedback_summary": result.feedback_summary,
            "metrics": result.metrics_json,
        },
        ensure_ascii=False,
        default=str,
    )


def _call_text_openai_compatible(
    config: AiProviderConfig, messages: list[dict[str, str]]
) -> str:
    base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
    api_key = decrypt_api_key(config.api_key_encrypted)
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=30.0,
        max_retries=0,
    )
    try:
        response = client.chat.completions.create(
            model=config.model_name,
            messages=messages,
            temperature=0.3,
        )
        content = response.choices[0].message.content
    except OpenAIAPIError as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, IndexError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return content.strip()


def _call_text_ollama(
    config: AiProviderConfig, messages: list[dict[str, str]]
) -> str:
    base_url = (config.base_url or "http://127.0.0.1:11434").rstrip("/")
    client = OllamaClient(host=base_url, timeout=60.0)
    try:
        response = client.chat(model=config.model_name, messages=messages)
        content = response.message.content
    except (OllamaResponseError, ConnectionError, OSError) as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return content.strip()


def generate_pose_detection_advice(
    config: AiProviderConfig,
    result: PoseDetectionResult,
    exercise: Optional[Exercise],
) -> str:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return _fake_pose_advice(result)

    messages = [
        {"role": "system", "content": POSE_ADVICE_SYSTEM_PROMPT},
        {"role": "user", "content": _pose_advice_user_prompt(result, exercise)},
    ]
    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        return _call_text_openai_compatible(config, messages)
    if config.provider_type == "ollama":
        return _call_text_ollama(config, messages)

    raise AiCoachError("Unsupported AI provider")
```

- [ ] **Step 4: Wire AI advice route**

Modify imports in `backend/app/api/routes/pose.py`:

```python
from app.services.ai_service import (
    AiCoachError,
    generate_pose_detection_advice,
    get_active_ai_provider_config,
)
from app.services.pose_service import (
    create_pose_detection_result,
    get_pose_detection_result,
    get_pose_result_exercise,
    list_pose_detection_results,
    save_pose_advice,
)
```

Replace `generate_my_pose_advice` with:

```python
@router.post("/results/{result_id}/ai-advice", response_model=PoseAdviceResponse)
def generate_my_pose_advice(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseAdviceResponse:
    result = get_pose_detection_result(db, current_user.id, result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pose detection result not found",
        )

    config = get_active_ai_provider_config(db, current_user.id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI provider config not found",
        )

    try:
        advice = generate_pose_detection_advice(
            config,
            result,
            get_pose_result_exercise(db, result),
        )
    except AiCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return {"result": save_pose_advice(db, result, config, advice)}
```

- [ ] **Step 5: Run AI advice tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_pose_detection.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ai_service.py backend/app/api/routes/pose.py backend/tests/test_pose_detection.py
git commit -m "feat: generate ai pose advice"
```

## Task 4: 前端姿态指标工具与 MediaPipe 依赖

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/pose/poseMetrics.ts`
- Create: `frontend/src/pose/poseMetrics.test.ts`
- Create: `frontend/src/pose/mediapipe.ts`

- [ ] **Step 1: Install frontend dependencies**

Run:

```bash
cd frontend
npm install @mediapipe/tasks-vision
npm install -D vitest
```

Expected: `package.json` contains `@mediapipe/tasks-vision` under `dependencies` and `vitest` under `devDependencies`.

- [ ] **Step 2: Add the frontend test script**

Modify `frontend/package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Write failing pose metrics tests**

Create `frontend/src/pose/poseMetrics.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  calculateAngle,
  createRepCounter,
  summarizePoseFrame,
  type PoseLandmark,
} from "./poseMetrics";

function landmarksWithKneeAngle(angle: number): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[23] = { x: 0, y: 0, z: 0, visibility: 0.95 };
  landmarks[25] = { x: 1, y: 0, z: 0, visibility: 0.95 };
  const radians = (angle * Math.PI) / 180;
  landmarks[27] = {
    x: 1 + Math.cos(radians),
    y: Math.sin(radians),
    z: 0,
    visibility: 0.95,
  };
  landmarks[24] = landmarks[23];
  landmarks[26] = landmarks[25];
  landmarks[28] = landmarks[27];
  return landmarks;
}

describe("pose metrics", () => {
  it("calculates a joint angle in degrees", () => {
    const angle = calculateAngle(
      { x: 0, y: 1, z: 0, visibility: 1 },
      { x: 0, y: 0, z: 0, visibility: 1 },
      { x: 1, y: 0, z: 0, visibility: 1 },
    );

    expect(angle).toBeCloseTo(90);
  });

  it("summarizes squat phase from knee angle", () => {
    const bottom = summarizePoseFrame(landmarksWithKneeAngle(90));
    const standing = summarizePoseFrame(landmarksWithKneeAngle(170));

    expect(bottom.phase).toBe("bottom");
    expect(standing.phase).toBe("standing");
    expect(standing.score).toBeGreaterThan(bottom.score);
  });

  it("counts one rep after standing bottom standing sequence", () => {
    const counter = createRepCounter();

    counter.ingest(landmarksWithKneeAngle(170), 0);
    counter.ingest(landmarksWithKneeAngle(90), 500);
    const snapshot = counter.ingest(landmarksWithKneeAngle(170), 1000);

    expect(snapshot.reps).toBe(1);
    expect(snapshot.bestScore).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run frontend tests to verify they fail**

Run:

```bash
cd frontend
npm run test -- src/pose/poseMetrics.test.ts
```

Expected: FAIL with `Failed to load url ./poseMetrics`.

- [ ] **Step 5: Add pose metrics implementation**

Create `frontend/src/pose/poseMetrics.ts`:

```typescript
export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PosePhase = "standing" | "moving" | "bottom" | "unknown";

export type PoseFrameSummary = {
  timestampMs: number;
  phase: PosePhase;
  reps: number;
  bestScore: number;
  score: number;
  feedback: string;
  keyAngles: {
    leftKnee: number | null;
    rightKnee: number | null;
  };
};

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

function isVisible(landmark: PoseLandmark | undefined) {
  return Boolean(landmark && (landmark.visibility ?? 1) >= 0.5);
}

export function calculateAngle(
  first: PoseLandmark,
  middle: PoseLandmark,
  last: PoseLandmark,
) {
  const firstAngle = Math.atan2(first.y - middle.y, first.x - middle.x);
  const lastAngle = Math.atan2(last.y - middle.y, last.x - middle.x);
  let degrees = Math.abs(((lastAngle - firstAngle) * 180) / Math.PI);
  if (degrees > 180) {
    degrees = 360 - degrees;
  }
  return degrees;
}

function kneeAngle(
  landmarks: PoseLandmark[],
  hipIndex: number,
  kneeIndex: number,
  ankleIndex: number,
) {
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  const ankle = landmarks[ankleIndex];
  if (!isVisible(hip) || !isVisible(knee) || !isVisible(ankle)) {
    return null;
  }
  return calculateAngle(hip, knee, ankle);
}

export function summarizePoseFrame(
  landmarks: PoseLandmark[],
): Omit<PoseFrameSummary, "timestampMs" | "reps" | "bestScore"> {
  const leftKnee = kneeAngle(landmarks, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE);
  const rightKnee = kneeAngle(landmarks, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE);
  const visibleAngles = [leftKnee, rightKnee].filter(
    (value): value is number => value !== null,
  );
  if (visibleAngles.length === 0) {
    return {
      phase: "unknown",
      score: 0,
      feedback: "保持全身进入画面",
      keyAngles: { leftKnee, rightKnee },
    };
  }

  const minKneeAngle = Math.min(...visibleAngles);
  const maxKneeAngle = Math.max(...visibleAngles);
  const asymmetry = Math.abs((leftKnee ?? maxKneeAngle) - (rightKnee ?? maxKneeAngle));

  const phase: PosePhase =
    minKneeAngle <= 115 ? "bottom" : minKneeAngle >= 155 ? "standing" : "moving";
  const depthScore =
    phase === "bottom" ? 88 : phase === "standing" ? 94 : 76;
  const score = Math.max(0, Math.min(100, depthScore - asymmetry * 0.5));
  const feedback =
    phase === "bottom"
      ? "底部深度已达到，保持膝盖朝脚尖方向"
      : phase === "standing"
        ? "站立姿态稳定，准备下一次下放"
        : "继续控制速度，保持核心收紧";

  return {
    phase,
    score,
    feedback,
    keyAngles: { leftKnee, rightKnee },
  };
}

export function createRepCounter() {
  let lastPhase: PosePhase = "unknown";
  let hasReachedBottom = false;
  let reps = 0;
  let bestScore = 0;

  return {
    ingest(landmarks: PoseLandmark[], timestampMs: number): PoseFrameSummary {
      const summary = summarizePoseFrame(landmarks);
      if (summary.phase === "bottom") {
        hasReachedBottom = true;
      }
      if (
        hasReachedBottom &&
        summary.phase === "standing" &&
        lastPhase !== "standing"
      ) {
        reps += 1;
        hasReachedBottom = false;
      }
      lastPhase = summary.phase;
      bestScore = Math.max(bestScore, summary.score);

      return {
        timestampMs,
        reps,
        bestScore,
        ...summary,
      };
    },
    reset() {
      lastPhase = "unknown";
      hasReachedBottom = false;
      reps = 0;
      bestScore = 0;
    },
  };
}
```

- [ ] **Step 6: Add MediaPipe loader**

Create `frontend/src/pose/mediapipe.ts`:

```typescript
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let cachedPoseLandmarker: Promise<PoseLandmarker> | null = null;

export function loadPoseLandmarker() {
  if (!cachedPoseLandmarker) {
    cachedPoseLandmarker = FilesetResolver.forVisionTasks(WASM_BASE_URL).then(
      (vision) =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
    );
  }
  return cachedPoseLandmarker;
}
```

- [ ] **Step 7: Run frontend tests and build**

Run:

```bash
cd frontend
npm run test -- src/pose/poseMetrics.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pose/poseMetrics.ts frontend/src/pose/poseMetrics.test.ts frontend/src/pose/mediapipe.ts
git commit -m "feat: add browser pose metrics"
```

## Task 5: 前端检测 API 客户端与检测页面

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/user/PoseDetectionPage.tsx`
- Modify: `frontend/src/routes/UserRoutes.tsx`

- [ ] **Step 1: Add API client types and functions**

Modify `frontend/src/api/client.ts` after `WorkoutSessionPayload`:

```typescript
export type PoseDetectionResult = {
  id: number;
  user_id: number;
  workout_session_id: number | null;
  exercise_id: number | null;
  workout_mode_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  reps_counted: number;
  score: number | null;
  feedback_summary: string | null;
  metrics_json: Record<string, unknown>;
  landmarks_sample_json: Record<string, unknown> | null;
  ai_advice: string | null;
  ai_provider_type: string | null;
  ai_model_name: string | null;
  ai_generated_at: string | null;
  created_at: string;
};

export type PoseDetectionResultPayload = Omit<
  PoseDetectionResult,
  | "id"
  | "user_id"
  | "ai_advice"
  | "ai_provider_type"
  | "ai_model_name"
  | "ai_generated_at"
  | "created_at"
>;
```

Add functions near workout functions:

```typescript
export function fetchPoseDetectionResults() {
  return apiRequest<PoseDetectionResult[]>("/pose/results");
}

export function createPoseDetectionResult(payload: PoseDetectionResultPayload) {
  return apiRequest<PoseDetectionResult>("/pose/results", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function requestPoseAdvice(resultId: number) {
  return apiRequest<{ result: PoseDetectionResult }>(
    `/pose/results/${resultId}/ai-advice`,
    {
      method: "POST",
    },
  );
}
```

- [ ] **Step 2: Create pose detection page**

Create `frontend/src/pages/user/PoseDetectionPage.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CircleStop, Play, Save, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Exercise,
  PoseDetectionResult,
  WorkoutMode,
  createPoseDetectionResult,
  createWorkoutSession,
  fetchExercises,
  fetchWorkoutModes,
  requestPoseAdvice,
} from "../../api/client";
import { loadPoseLandmarker } from "../../pose/mediapipe";
import {
  PoseFrameSummary,
  PoseLandmark,
  createRepCounter,
} from "../../pose/poseMetrics";

function numericParam(value: string | null) {
  return value ? Number(value) : null;
}

function drawLandmarks(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: PoseLandmark[],
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.fillStyle = "#14b8a6";
  landmarks.forEach((landmark) => {
    if ((landmark.visibility ?? 1) < 0.5) {
      return;
    }
    context.beginPath();
    context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, Math.PI * 2);
    context.fill();
  });
}

export default function PoseDetectionPage() {
  const [searchParams] = useSearchParams();
  const exerciseId = numericParam(searchParams.get("exerciseId"));
  const workoutModeId = numericParam(searchParams.get("workoutModeId"));
  const titleParam = searchParams.get("title");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const counterRef = useRef(createRepCounter());
  const startedAtRef = useRef<Date | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<PoseFrameSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PoseFrameSummary[]>([]);
  const [landmarkSamples, setLandmarkSamples] = useState<PoseLandmark[][]>([]);
  const [savedResult, setSavedResult] = useState<PoseDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const exercise = useMemo(
    () => exercises.find((item) => item.id === exerciseId) ?? null,
    [exerciseId, exercises],
  );
  const workoutMode = useMemo(
    () => modes.find((item) => item.id === workoutModeId) ?? null,
    [workoutModeId, modes],
  );
  const displayTitle =
    titleParam ?? exercise?.name ?? workoutMode?.name ?? "动作检测";

  useEffect(() => {
    let isMounted = true;
    void Promise.all([fetchExercises(), fetchWorkoutModes()])
      .then(([nextExercises, nextModes]) => {
        if (!isMounted) {
          return;
        }
        setExercises(nextExercises);
        setModes(nextModes);
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "检测配置读取失败");
        }
      });
    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRunning(false);
  }

  async function startCamera() {
    setError(null);
    setStatus(null);
    setSavedResult(null);
    counterRef.current.reset();
    setSnapshot(null);
    setSnapshots([]);
    setLandmarkSamples([]);
    startedAtRef.current = new Date();

    try {
      const video = videoRef.current;
      if (!video) {
        throw new Error("视频组件未就绪");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const landmarker = await loadPoseLandmarker();
      setIsRunning(true);

      const loop = () => {
        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks = (result.landmarks[0] ?? []) as PoseLandmark[];
        if (landmarks.length > 0) {
          const nextSnapshot = counterRef.current.ingest(landmarks, performance.now());
          setSnapshot(nextSnapshot);
          setSnapshots((current) => [...current.slice(-29), nextSnapshot]);
          setLandmarkSamples((current) => [...current.slice(-4), landmarks]);
          const canvas = canvasRef.current;
          if (canvas) {
            drawLandmarks(canvas, video, landmarks);
          }
        }
        frameRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (caught) {
      stopCamera();
      setError(caught instanceof Error ? caught.message : "摄像头或动作检测启动失败");
    }
  }

  async function saveResult() {
    const startedAt = startedAtRef.current;
    if (!startedAt || !snapshot) {
      setError("没有可保存的检测结果");
      return;
    }
    const endedAt = new Date();
    const durationSeconds = Math.max(
      1,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const session = await createWorkoutSession({
        workout_mode_id: workoutModeId,
        exercise_id: exerciseId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        calories_burned: 0,
        reps: snapshot.reps,
        score: snapshot.bestScore,
        status: "completed",
        notes: snapshot.feedback,
      });
      const result = await createPoseDetectionResult({
        workout_session_id: session.id,
        exercise_id: exerciseId,
        workout_mode_id: workoutModeId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
        reps_counted: snapshot.reps,
        score: snapshot.bestScore,
        feedback_summary: snapshot.feedback,
        metrics_json: {
          source: "mediapipe_pose_landmarker",
          display_title: displayTitle,
          snapshots,
          detection_rules: exercise?.detection_rules ?? null,
        },
        landmarks_sample_json: { frames: landmarkSamples },
      });
      setSavedResult(result);
      setStatus("检测结果已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "检测结果保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadAdvice() {
    if (!savedResult) {
      return;
    }
    setIsAdviceLoading(true);
    setError(null);
    try {
      const response = await requestPoseAdvice(savedResult.id);
      setSavedResult(response.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 动作建议生成失败");
    } finally {
      setIsAdviceLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{displayTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">
            浏览器实时检测姿态，结束后保存训练记录和动作报告。
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
          to="/app/train"
        >
          返回训练
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-soft">
          <div className="relative aspect-[4/3]">
            <video
              ref={videoRef}
              className="hidden"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="h-full w-full"
            />
            {!isRunning && !snapshot ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                摄像头未启动
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-3">
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {snapshot?.reps ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-500">次数</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {Math.round(snapshot?.bestScore ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">评分</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {snapshot?.phase ?? "unknown"}
                </p>
                <p className="mt-1 text-xs text-slate-500">状态</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {snapshot?.feedback ?? "开始后保持全身进入画面。"}
            </p>
          </article>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              disabled={isRunning}
              onClick={() => void startCamera()}
              type="button"
            >
              {isRunning ? <Camera aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={17} />}
              开始
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal disabled:opacity-60"
              disabled={!isRunning}
              onClick={stopCamera}
              type="button"
            >
              <CircleStop aria-hidden="true" size={17} />
              结束
            </button>
          </div>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isRunning || isSaving || !snapshot}
            onClick={() => void saveResult()}
            type="button"
          >
            <Save aria-hidden="true" size={17} />
            {isSaving ? "保存中" : "保存结果"}
          </button>

          {savedResult ? (
            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <h3 className="text-base font-semibold text-slate-950">动作报告</h3>
              <p className="mt-2 text-sm text-slate-600">
                {savedResult.reps_counted} 次 · {Math.round(savedResult.score ?? 0)} 分
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {savedResult.feedback_summary}
              </p>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
                disabled={isAdviceLoading}
                onClick={() => void loadAdvice()}
                type="button"
              >
                <Sparkles aria-hidden="true" size={17} />
                {isAdviceLoading ? "生成中" : "AI 建议"}
              </button>
              {savedResult.ai_advice ? (
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {savedResult.ai_advice}
                </p>
              ) : null}
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Register the route**

Modify `frontend/src/routes/UserRoutes.tsx`:

```tsx
import PoseDetectionPage from "../pages/user/PoseDetectionPage";
```

```tsx
<Route path="pose" element={<PoseDetectionPage />} />
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/user/PoseDetectionPage.tsx frontend/src/routes/UserRoutes.tsx
git commit -m "feat: add pose detection page"
```

## Task 6: 训练页和课表页接入检测入口

**Files:**
- Modify: `frontend/src/pages/user/HomePage.tsx`
- Modify: `frontend/src/pages/user/TrainingPage.tsx`
- Modify: `frontend/src/pages/user/TrainingPlansPage.tsx`

- [ ] **Step 1: Add home quick entry**

Modify `frontend/src/pages/user/HomePage.tsx` imports:

```tsx
import { Camera, Dumbbell, Sparkles, Timer } from "lucide-react";
```

Modify `cards`:

```tsx
const cards = [
  { title: "今日计划", label: "查看训练安排", to: "/app/train", icon: Timer },
  { title: "动作检测", label: "打开摄像头检测", to: "/app/pose", icon: Camera },
  { title: "AI 教练", label: "生成训练建议", to: "/app/ai-settings", icon: Sparkles },
  { title: "快速训练", label: "进入运动模式", to: "/app/train?tab=new", icon: Dumbbell },
];
```

- [ ] **Step 2: Add training page detection links**

Modify `frontend/src/pages/user/TrainingPage.tsx` imports:

```tsx
import { Camera, Dumbbell, ListChecks, Plus, Timer } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
```

Add helper near `parseOptionalId`:

```tsx
function poseUrl(params: {
  exerciseId?: number | null;
  workoutModeId?: number | null;
  title?: string | null;
}) {
  const search = new URLSearchParams();
  if (params.exerciseId) {
    search.set("exerciseId", String(params.exerciseId));
  }
  if (params.workoutModeId) {
    search.set("workoutModeId", String(params.workoutModeId));
  }
  if (params.title) {
    search.set("title", params.title);
  }
  const query = search.toString();
  return query ? `/app/pose?${query}` : "/app/pose";
}
```

Add this block below the summary cards:

```tsx
<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h3 className="text-base font-semibold text-slate-950">动作检测</h3>
      <p className="mt-1 text-sm text-slate-600">
        从任意训练进入摄像头检测，保存后会生成训练记录。
      </p>
    </div>
    <Link
      className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-gym-teal text-white transition hover:bg-teal-800"
      to="/app/pose"
      aria-label="开始动作检测"
      title="开始动作检测"
    >
      <Camera aria-hidden="true" size={18} />
    </Link>
  </div>
  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
    {exercises.slice(0, 8).map((exercise) => (
      <Link
        key={exercise.id}
        className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
        to={poseUrl({ exerciseId: exercise.id, title: exercise.name })}
      >
        {exercise.name}
      </Link>
    ))}
  </div>
</div>
```

Inside `renderNewTrainingForm`, add this link above the submit button:

```tsx
<Link
  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint"
  to={poseUrl({
    exerciseId: parseOptionalId(form.exercise_id),
    workoutModeId: parseOptionalId(form.workout_mode_id),
    title:
      exerciseNames.get(Number(form.exercise_id)) ??
      modeNames.get(Number(form.workout_mode_id)) ??
      "自由训练",
  })}
>
  <Camera aria-hidden="true" size={17} />
  动作检测
</Link>
```

- [ ] **Step 3: Preserve plan item IDs and add plan item detection links**

Modify `frontend/src/pages/user/TrainingPlansPage.tsx` imports:

```tsx
import {
  Bot,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Edit3,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
```

Modify `ItemForm`:

```tsx
type ItemForm = {
  scheduled_date: string | null;
  day_of_week: string;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  sets: string;
  reps: string;
  duration_minutes: string;
  notes: string;
};
```

Modify `createDefaultItem`:

```tsx
function createDefaultItem(dateKey: string): ItemForm {
  return {
    scheduled_date: dateKey,
    day_of_week: String(mondayWeekday(fromDateKey(dateKey))),
    exercise_id: null,
    workout_mode_id: null,
    title: "训练安排",
    sets: "",
    reps: "",
    duration_minutes: "30",
    notes: "",
  };
}
```

Modify `toFormItem`:

```tsx
function toFormItem(item: TrainingPlanItemPayload | TrainingPlanDetail["items"][number]) {
  return {
    scheduled_date: item.scheduled_date,
    day_of_week: String(item.day_of_week),
    exercise_id: item.exercise_id,
    workout_mode_id: item.workout_mode_id,
    title: item.title,
    sets: item.sets ? String(item.sets) : "",
    reps: item.reps ? String(item.reps) : "",
    duration_minutes: item.duration_minutes ? String(item.duration_minutes) : "",
    notes: item.notes ?? "",
  };
}
```

Modify `toPayload`:

```tsx
function toPayload(item: ItemForm, sortOrder: number): TrainingPlanItemPayload {
  return {
    scheduled_date: item.scheduled_date,
    day_of_week: Number(item.day_of_week),
    sort_order: sortOrder,
    exercise_id: item.exercise_id,
    workout_mode_id: item.workout_mode_id,
    title: item.title.trim(),
    sets: item.sets ? Number(item.sets) : null,
    reps: item.reps ? Number(item.reps) : null,
    duration_minutes: item.duration_minutes ? Number(item.duration_minutes) : null,
    notes: item.notes.trim() || null,
  };
}
```

Add helper near `metaText`:

```tsx
function poseUrl(item: ItemForm) {
  const search = new URLSearchParams();
  if (item.exercise_id) {
    search.set("exerciseId", String(item.exercise_id));
  }
  if (item.workout_mode_id) {
    search.set("workoutModeId", String(item.workout_mode_id));
  }
  search.set("title", item.title);
  return `/app/pose?${search.toString()}`;
}
```

Inside the non-editing modal `selectedDisplayItems.map` article, add this link after notes:

```tsx
<Link
  className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint"
  to={poseUrl(item)}
>
  <Camera aria-hidden="true" size={17} />
  动作检测
</Link>
```

- [ ] **Step 4: Run frontend tests and build**

Run:

```bash
cd frontend
npm run test -- src/pose/poseMetrics.test.ts
npm run build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/user/HomePage.tsx frontend/src/pages/user/TrainingPage.tsx frontend/src/pages/user/TrainingPlansPage.tsx
git commit -m "feat: add pose detection entry points"
```

## Task 7: Full verification

**Files:**
- No source file changes expected.

- [ ] **Step 1: Run backend tests**

Run:

```bash
cd backend
pytest -v
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests and production build**

Run:

```bash
cd frontend
npm run test -- src/pose/poseMetrics.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run migrations against local database**

Run:

```bash
cd backend
alembic upgrade head
```

Expected: command exits 0 and applies `20260607_phase4_pose`.

- [ ] **Step 4: Start the app for browser verification**

Run backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Run frontend in another terminal:

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000/api npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: frontend serves at `http://127.0.0.1:5173`.

- [ ] **Step 5: Browser verification checklist**

Use the in-app Browser against `http://127.0.0.1:5173`:

- Register or log in as a normal user.
- Open `/app/train`; verify the动作检测 card and exercise chips are visible.
- Open `/app/pose`; grant camera permission; verify canvas displays camera frames and landmark dots.
- Perform one squat-like standing-bottom-standing sequence; verify count increments.
- Stop detection and save; verify `检测结果已保存`.
- Click `AI 建议` with no AI Provider config; verify user-facing error is `AI provider config not found`.
- Add an AI Provider config from `/app/ai-settings` or set fake response env for backend tests; verify AI advice appears and remains on the report.
- Open `/app/plans`; open a day with a training item; verify `动作检测` link navigates to `/app/pose?title=...`.

- [ ] **Step 6: Commit verification-only fixes**

If verification required source changes, commit them:

```bash
git add backend frontend
git commit -m "fix: polish pose detection flow"
```

If verification required no source changes, do not create an empty commit.

## Self-Review

Spec coverage:

- 前端 MediaPipe: Task 4 adds `@mediapipe/tasks-vision` loader and Task 5 adds browser pose detection page.
- 所有训练的检测入口: Task 6 adds home, training page, manual training form, and training plan item entry points.
- 结果保存: Task 1 adds persistence and Task 2 adds `/api/pose/results`.
- AI 动作建议: Task 3 adds provider-isolated advice generation and stores advice on the detection result.
- 摄像头失败不阻塞训练记录: Existing `/app/train?tab=new` manual training flow remains unchanged; Task 5 surfaces camera errors inside the detection page.
- 用户数据隔离: Task 2 tests current-user list/detail and cross-user workout session rejection; Task 3 tests current-user provider config isolation.

Placeholder scan:

- No placeholder markers from the plan rules are present.
- Every code-changing step includes concrete code or exact commands.

Type consistency:

- Backend uses `PoseDetectionResultCreate`, `PoseDetectionResultResponse`, and `PoseAdviceResponse` consistently across schemas, routes, and services.
- Frontend uses `PoseDetectionResultPayload` for `POST /pose/results` and `PoseDetectionResult` for all responses.
- Query parameter names are consistent: `exerciseId`, `workoutModeId`, and `title`.
