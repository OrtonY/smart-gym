# 智慧健身房第 2 期训练与榜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现第 2 期训练与榜单闭环，包括运动模式、训练记录、公开榜单、动作和教程内容管理。

**Architecture:** 后端沿用第 1 期 FastAPI 单体分层结构，新增 `content`、`workouts`、`leaderboard` 三组模型、schema、service 和 route。前端继续使用单 React PWA，通过用户端 `/app/train`、`/app/leaderboard` 和管理端 `/admin/content` 提供训练、榜单和内容管理入口。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy 2.x、Alembic、PostgreSQL、pytest、httpx、React、Vite、TypeScript、Tailwind CSS、React Router、lucide-react。

---

## 范围说明

本计划只实现规格中的第 2 期：

- 运动模式。
- 训练记录。
- 公开榜单。
- 动作和教程内容管理。

本计划不实现 AI 课表、AI 食谱、动作检测、食物识别和手环导入；这些属于第 3、4、5 期。第 2 期的数据结构要让后续阶段能引用运动模式、动作库和训练记录。

对应规格文档：

- `docs/superpowers/specs/2026-06-05-smart-gym-design.md`
- `docs/superpowers/plans/2026-06-05-smart-gym-phase-1-platform.md`

## 当前代码假设

第 1 期已落地：

- 后端入口：`backend/app/main.py`
- API 汇总路由：`backend/app/api/router.py`
- 当前用户和管理员依赖：`backend/app/api/deps.py`
- 用户模型：`backend/app/models/user.py`
- 测试数据库 fixture：`backend/tests/conftest.py`
- 前端 API 客户端：`frontend/src/api/client.ts`
- 用户端路由：`frontend/src/routes/UserRoutes.tsx`
- 管理端路由：`frontend/src/routes/AdminRoutes.tsx`
- 布局导航：`frontend/src/components/Layout.tsx`

## 目标文件结构

```text
backend/
  app/
    api/
      router.py
      routes/
        admin_content.py
        catalog.py
        leaderboard.py
        workouts.py
    models/
      __init__.py
      exercise.py
      leaderboard_snapshot.py
      workout_mode.py
      workout_session.py
    schemas/
      content.py
      leaderboard.py
      workouts.py
    services/
      content_service.py
      leaderboard_service.py
      workout_service.py
    migrations/
      versions/
        20260606_phase2_training_content.py
  tests/
    conftest.py
    test_content_admin.py
    test_leaderboard.py
    test_workout_sessions.py
frontend/
  src/
    api/client.ts
    components/Layout.tsx
    pages/
      admin/AdminContentPage.tsx
      user/LeaderboardPage.tsx
      user/TrainingPage.tsx
    routes/
      AdminRoutes.tsx
      UserRoutes.tsx
```

## Data Contracts

### Backend model fields

`WorkoutMode`:

- `id: int`
- `code: str` unique, examples: `strength`, `cardio`, `hiit`
- `name: str`
- `description: str | None`
- `estimated_calories_per_hour: int`
- `is_active: bool`
- `created_at: datetime`

`Exercise`:

- `id: int`
- `slug: str` unique
- `name: str`
- `target_muscle: str`
- `difficulty: str`, allowed by service: `beginner`, `intermediate`, `advanced`
- `description: str | None`
- `tutorial_url: str | None`
- `media_url: str | None`
- `detection_rules: dict | None`
- `is_published: bool`
- `created_at: datetime`

`WorkoutSession`:

- `id: int`
- `user_id: int`
- `workout_mode_id: int | None`
- `exercise_id: int | None`
- `started_at: datetime`
- `ended_at: datetime | None`
- `duration_minutes: int`
- `calories_burned: int`
- `reps: int | None`
- `score: float | None`
- `status: str`, values used in this plan: `completed`, `abandoned`
- `notes: str | None`
- `created_at: datetime`

`LeaderboardSnapshot`:

- `id: int`
- `period_type: str`, values: `weekly`, `monthly`
- `metric_type: str`, values: `duration_minutes`, `calories_burned`, `sessions_count`
- `period_start: date`
- `period_end: date`
- `user_id: int`
- `display_name: str`
- `avatar_url: str | None`
- `value: float`
- `rank: int`
- `generated_at: datetime`

### Backend route contracts

Admin content routes require `require_admin`:

- `POST /api/admin/workout-modes`
- `PUT /api/admin/workout-modes/{mode_id}`
- `POST /api/admin/exercises`
- `PUT /api/admin/exercises/{exercise_id}`

Authenticated catalog routes:

- `GET /api/catalog/workout-modes`
- `GET /api/catalog/exercises`

Authenticated workout routes:

- `POST /api/workouts/sessions`
- `GET /api/workouts/sessions`
- `GET /api/workouts/summary`

Authenticated leaderboard routes:

- `POST /api/leaderboard/refresh`
- `GET /api/leaderboard?period_type=weekly&metric_type=duration_minutes`

`POST /api/leaderboard/refresh` can be protected by current user authentication in phase 2 so tests and local demos can trigger recalculation. It must not expose private fields. A later scheduled job can call the same service.

## Task 1: 后端第 2 期数据模型

**Files:**
- Create: `backend/app/models/workout_mode.py`
- Create: `backend/app/models/exercise.py`
- Create: `backend/app/models/workout_session.py`
- Create: `backend/app/models/leaderboard_snapshot.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_phase2_models.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_phase2_models.py`:

```python
from app.models.exercise import Exercise
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession


def test_phase2_models_have_required_columns():
    assert "code" in WorkoutMode.__table__.columns
    assert "estimated_calories_per_hour" in WorkoutMode.__table__.columns
    assert "slug" in Exercise.__table__.columns
    assert "detection_rules" in Exercise.__table__.columns
    assert "user_id" in WorkoutSession.__table__.columns
    assert "duration_minutes" in WorkoutSession.__table__.columns
    assert "calories_burned" in WorkoutSession.__table__.columns
    assert "display_name" in LeaderboardSnapshot.__table__.columns
    assert "rank" in LeaderboardSnapshot.__table__.columns
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
python -m pytest tests/test_phase2_models.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.workout_mode'`.

- [ ] **Step 3: Add model files**

Create `backend/app/models/workout_mode.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutMode(Base):
    __tablename__ = "workout_modes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estimated_calories_per_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

Create `backend/app/models/exercise.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Exercise(Base):
    __tablename__ = "exercise_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_muscle: Mapped[str] = mapped_column(String(120), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), nullable=False, default="beginner")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tutorial_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    detection_rules: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

Create `backend/app/models/workout_session.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    workout_mode_id: Mapped[Optional[int]] = mapped_column(ForeignKey("workout_modes.id"), nullable=True)
    exercise_id: Mapped[Optional[int]] = mapped_column(ForeignKey("exercise_library.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    calories_burned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="completed")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

Create `backend/app/models/leaderboard_snapshot.py`:

```python
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeaderboardSnapshot(Base):
    __tablename__ = "leaderboard_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    period_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    metric_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
```

Update `backend/app/models/__init__.py`:

```python
from app.models.ai_provider_config import AiProviderConfig
from app.models.exercise import Exercise
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession

__all__ = [
    "AiProviderConfig",
    "Exercise",
    "LeaderboardSnapshot",
    "User",
    "UserProfile",
    "WorkoutMode",
    "WorkoutSession",
]
```

Update `backend/tests/conftest.py` imports and `_models`:

```python
from app.models.ai_provider_config import AiProviderConfig
from app.models.exercise import Exercise
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession

_models = (
    AiProviderConfig,
    Exercise,
    LeaderboardSnapshot,
    User,
    UserProfile,
    WorkoutMode,
    WorkoutSession,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd backend
python -m pytest tests/test_phase2_models.py -v
```

Expected: PASS.

- [ ] **Step 5: Create Alembic migration**

Run:

```bash
cd backend
alembic revision --autogenerate --rev-id 20260606_phase2 -m "phase 2 training content"
```

Expected: `backend/app/migrations/versions/20260606_phase2_phase_2_training_content.py` is created.

Rename the generated file so it has the exact target path used by this plan:

```bash
mv backend/app/migrations/versions/20260606_phase2_phase_2_training_content.py backend/app/migrations/versions/20260606_phase2_training_content.py
```

Expected: `backend/app/migrations/versions/20260606_phase2_training_content.py` exists.

Open `backend/app/migrations/versions/20260606_phase2_training_content.py` and confirm `upgrade()` creates these tables:

- `workout_modes`
- `exercise_library`
- `workout_sessions`
- `leaderboard_snapshots`

Then run:

```bash
cd backend
alembic upgrade head
```

Expected: command exits with code 0 against the configured development database.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models backend/app/migrations backend/tests/conftest.py backend/tests/test_phase2_models.py
git commit -m "feat: add phase 2 domain models"
```

## Task 2: 管理端内容 API 与用户端内容目录 API

**Files:**
- Create: `backend/app/schemas/content.py`
- Create: `backend/app/services/content_service.py`
- Create: `backend/app/api/routes/admin_content.py`
- Create: `backend/app/api/routes/catalog.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_content_admin.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_content_admin.py`:

```python
def test_admin_can_create_workout_mode_and_user_can_read_active_catalog(client, create_user_and_token):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    _, user_token = create_user_and_token("member@example.com", role="user")

    create_response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "strength",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["code"] == "strength"

    catalog_response = client.get(
        "/api/catalog/workout-modes",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert catalog_response.status_code == 200
    assert catalog_response.json() == [
        {
            "id": create_response.json()["id"],
            "code": "strength",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        }
    ]


def test_non_admin_cannot_create_workout_mode(client, create_user_and_token):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "code": "cardio",
            "name": "有氧训练",
            "description": "跑步和椭圆机",
            "estimated_calories_per_hour": 420,
            "is_active": True,
        },
    )

    assert response.status_code == 403


def test_admin_can_create_exercise_and_catalog_only_returns_published(client, create_user_and_token):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    _, user_token = create_user_and_token("member@example.com", role="user")

    published_response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "bodyweight-squat",
            "name": "徒手深蹲",
            "target_muscle": "腿部",
            "difficulty": "beginner",
            "description": "基础下肢训练动作",
            "tutorial_url": "https://example.com/squat",
            "media_url": "https://example.com/squat.mp4",
            "detection_rules": {"counter": "knee_angle"},
            "is_published": True,
        },
    )
    draft_response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "draft-push-up",
            "name": "草稿俯卧撑",
            "target_muscle": "胸部",
            "difficulty": "intermediate",
            "description": "未发布内容",
            "tutorial_url": None,
            "media_url": None,
            "detection_rules": None,
            "is_published": False,
        },
    )

    assert published_response.status_code == 201
    assert draft_response.status_code == 201

    catalog_response = client.get(
        "/api/catalog/exercises",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert catalog_response.status_code == 200
    exercises = catalog_response.json()
    assert [item["slug"] for item in exercises] == ["bodyweight-squat"]
    assert exercises[0]["detection_rules"] == {"counter": "knee_angle"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_content_admin.py -v
```

Expected: FAIL with 404 responses because routes are not registered.

- [ ] **Step 3: Add schemas**

Create `backend/app/schemas/content.py`:

```python
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkoutModeBase(BaseModel):
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    estimated_calories_per_hour: int = Field(ge=0, le=2000)
    is_active: bool = True


class WorkoutModeCreate(WorkoutModeBase):
    pass


class WorkoutModeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    estimated_calories_per_hour: int | None = Field(default=None, ge=0, le=2000)
    is_active: bool | None = None


class WorkoutModeResponse(WorkoutModeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ExerciseBase(BaseModel):
    slug: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    target_muscle: str = Field(min_length=1, max_length=120)
    difficulty: str = Field(pattern="^(beginner|intermediate|advanced)$")
    description: str | None = None
    tutorial_url: str | None = None
    media_url: str | None = None
    detection_rules: dict[str, Any] | None = None
    is_published: bool = False


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    target_muscle: str | None = Field(default=None, min_length=1, max_length=120)
    difficulty: str | None = Field(default=None, pattern="^(beginner|intermediate|advanced)$")
    description: str | None = None
    tutorial_url: str | None = None
    media_url: str | None = None
    detection_rules: dict[str, Any] | None = None
    is_published: bool | None = None


class ExerciseResponse(ExerciseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
```

- [ ] **Step 4: Add content service**

Create `backend/app/services/content_service.py`:

```python
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.schemas.content import (
    ExerciseCreate,
    ExerciseUpdate,
    WorkoutModeCreate,
    WorkoutModeUpdate,
)


def create_workout_mode(db: Session, payload: WorkoutModeCreate) -> WorkoutMode:
    mode = WorkoutMode(**payload.model_dump())
    db.add(mode)
    db.commit()
    db.refresh(mode)
    return mode


def update_workout_mode(db: Session, mode_id: int, payload: WorkoutModeUpdate) -> Optional[WorkoutMode]:
    mode = db.get(WorkoutMode, mode_id)
    if mode is None:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(mode, field, value)
    db.commit()
    db.refresh(mode)
    return mode


def list_workout_modes(db: Session, active_only: bool) -> List[WorkoutMode]:
    statement = select(WorkoutMode).order_by(WorkoutMode.id)
    if active_only:
        statement = statement.where(WorkoutMode.is_active.is_(True))
    return list(db.execute(statement).scalars())


def create_exercise(db: Session, payload: ExerciseCreate) -> Exercise:
    exercise = Exercise(**payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def update_exercise(db: Session, exercise_id: int, payload: ExerciseUpdate) -> Optional[Exercise]:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return exercise


def list_exercises(db: Session, published_only: bool) -> List[Exercise]:
    statement = select(Exercise).order_by(Exercise.id)
    if published_only:
        statement = statement.where(Exercise.is_published.is_(True))
    return list(db.execute(statement).scalars())
```

- [ ] **Step 5: Add routes**

Create `backend/app/api/routes/admin_content.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.content import (
    ExerciseCreate,
    ExerciseResponse,
    ExerciseUpdate,
    WorkoutModeCreate,
    WorkoutModeResponse,
    WorkoutModeUpdate,
)
from app.services.content_service import (
    create_exercise,
    create_workout_mode,
    update_exercise,
    update_workout_mode,
)

router = APIRouter()


@router.post("/workout-modes", response_model=WorkoutModeResponse, status_code=status.HTTP_201_CREATED)
def create_admin_workout_mode(
    payload: WorkoutModeCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WorkoutModeResponse:
    return create_workout_mode(db, payload)


@router.put("/workout-modes/{mode_id}", response_model=WorkoutModeResponse)
def update_admin_workout_mode(
    mode_id: int,
    payload: WorkoutModeUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WorkoutModeResponse:
    mode = update_workout_mode(db, mode_id, payload)
    if mode is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout mode not found")
    return mode


@router.post("/exercises", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
def create_admin_exercise(
    payload: ExerciseCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ExerciseResponse:
    return create_exercise(db, payload)


@router.put("/exercises/{exercise_id}", response_model=ExerciseResponse)
def update_admin_exercise(
    exercise_id: int,
    payload: ExerciseUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ExerciseResponse:
    exercise = update_exercise(db, exercise_id, payload)
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise
```

Create `backend/app/api/routes/catalog.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.content import ExerciseResponse, WorkoutModeResponse
from app.services.content_service import list_exercises, list_workout_modes

router = APIRouter()


@router.get("/workout-modes", response_model=list[WorkoutModeResponse])
def list_catalog_workout_modes(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkoutModeResponse]:
    return list_workout_modes(db, active_only=True)


@router.get("/exercises", response_model=list[ExerciseResponse])
def list_catalog_exercises(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExerciseResponse]:
    return list_exercises(db, published_only=True)
```

Update `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api.routes import admin_content, ai_configs, auth, catalog, health, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(admin_content.router, prefix="/admin", tags=["admin-content"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_content_admin.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/router.py backend/app/api/routes/admin_content.py backend/app/api/routes/catalog.py backend/app/schemas/content.py backend/app/services/content_service.py backend/tests/test_content_admin.py
git commit -m "feat: add content management APIs"
```

## Task 3: 训练记录 API 与用户隔离

**Files:**
- Create: `backend/app/schemas/workouts.py`
- Create: `backend/app/services/workout_service.py`
- Create: `backend/app/api/routes/workouts.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_workout_sessions.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_workout_sessions.py`:

```python
from datetime import datetime

from app.models.workout_session import WorkoutSession


def test_user_can_create_and_list_own_workout_sessions(client, create_user_and_token):
    _, token = create_user_and_token("member@example.com", role="user")

    create_response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": None,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": "2026-06-06T08:35:00",
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": 80,
            "score": 86.5,
            "status": "completed",
            "notes": "深蹲和核心训练",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["duration_minutes"] == 35

    list_response = client.get(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["notes"] == "深蹲和核心训练"


def test_user_cannot_list_other_users_workout_sessions(client, db_session, create_user_and_token):
    owner, _ = create_user_and_token("owner@example.com", role="user")
    _, viewer_token = create_user_and_token("viewer@example.com", role="user")
    db_session.add(
        WorkoutSession(
            user_id=owner.id,
            started_at=datetime(2026, 6, 6, 8, 0, 0),
            duration_minutes=45,
            calories_burned=300,
            status="completed",
        )
    )
    db_session.commit()

    response = client.get(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_workout_summary_uses_only_current_user(client, db_session, create_user_and_token):
    current_user, token = create_user_and_token("current@example.com", role="user")
    other_user, _ = create_user_and_token("other@example.com", role="user")
    db_session.add_all(
        [
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 6, 8, 0, 0),
                duration_minutes=30,
                calories_burned=180,
                status="completed",
            ),
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 7, 8, 0, 0),
                duration_minutes=40,
                calories_burned=260,
                status="completed",
            ),
            WorkoutSession(
                user_id=other_user.id,
                started_at=datetime(2026, 6, 7, 9, 0, 0),
                duration_minutes=200,
                calories_burned=1200,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/workouts/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "sessions_count": 2,
        "total_duration_minutes": 70,
        "total_calories_burned": 440,
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_workout_sessions.py -v
```

Expected: FAIL with 404 responses because workout routes are not registered.

- [ ] **Step 3: Add workout schemas**

Create `backend/app/schemas/workouts.py`:

```python
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WorkoutSessionCreate(BaseModel):
    workout_mode_id: int | None = None
    exercise_id: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_minutes: int = Field(ge=1, le=1440)
    calories_burned: int = Field(ge=0, le=10000)
    reps: int | None = Field(default=None, ge=0, le=100000)
    score: float | None = Field(default=None, ge=0, le=100)
    status: str = Field(pattern="^(completed|abandoned)$")
    notes: str | None = None


class WorkoutSessionResponse(WorkoutSessionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int


class WorkoutSummaryResponse(BaseModel):
    sessions_count: int
    total_duration_minutes: int
    total_calories_burned: int
```

- [ ] **Step 4: Add workout service**

Create `backend/app/services/workout_service.py`:

```python
from __future__ import annotations

from typing import List

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.workout_session import WorkoutSession
from app.schemas.workouts import WorkoutSessionCreate


def create_workout_session(db: Session, user_id: int, payload: WorkoutSessionCreate) -> WorkoutSession:
    session = WorkoutSession(user_id=user_id, **payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_workout_sessions(db: Session, user_id: int) -> List[WorkoutSession]:
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
    )
    return list(db.execute(statement).scalars())


def get_workout_summary(db: Session, user_id: int) -> dict[str, int]:
    statement = select(
        func.count(WorkoutSession.id),
        func.coalesce(func.sum(WorkoutSession.duration_minutes), 0),
        func.coalesce(func.sum(WorkoutSession.calories_burned), 0),
    ).where(WorkoutSession.user_id == user_id)
    sessions_count, duration, calories = db.execute(statement).one()
    return {
        "sessions_count": int(sessions_count),
        "total_duration_minutes": int(duration),
        "total_calories_burned": int(calories),
    }
```

- [ ] **Step 5: Add workout routes and register them**

Create `backend/app/api/routes/workouts.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.workouts import (
    WorkoutSessionCreate,
    WorkoutSessionResponse,
    WorkoutSummaryResponse,
)
from app.services.workout_service import (
    create_workout_session,
    get_workout_summary,
    list_workout_sessions,
)

router = APIRouter()


@router.post("/sessions", response_model=WorkoutSessionResponse, status_code=status.HTTP_201_CREATED)
def create_my_workout_session(
    payload: WorkoutSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSessionResponse:
    return create_workout_session(db, current_user.id, payload)


@router.get("/sessions", response_model=list[WorkoutSessionResponse])
def list_my_workout_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkoutSessionResponse]:
    return list_workout_sessions(db, current_user.id)


@router.get("/summary", response_model=WorkoutSummaryResponse)
def read_my_workout_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSummaryResponse:
    return get_workout_summary(db, current_user.id)
```

Update `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api.routes import admin_content, ai_configs, auth, catalog, health, users, workouts

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(admin_content.router, prefix="/admin", tags=["admin-content"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_workout_sessions.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/router.py backend/app/api/routes/workouts.py backend/app/schemas/workouts.py backend/app/services/workout_service.py backend/tests/test_workout_sessions.py
git commit -m "feat: add workout session APIs"
```

## Task 4: 公开榜单 API

**Files:**
- Create: `backend/app/schemas/leaderboard.py`
- Create: `backend/app/services/leaderboard_service.py`
- Create: `backend/app/api/routes/leaderboard.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_leaderboard.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_leaderboard.py`:

```python
from datetime import datetime

from app.models.workout_session import WorkoutSession


def test_refresh_and_read_weekly_leaderboard_exposes_only_public_fields(client, db_session, create_user_and_token):
    alice, alice_token = create_user_and_token("alice@example.com", role="user")
    bob, _ = create_user_and_token("bob@example.com", role="user")
    alice.display_name = "Alice"
    alice.avatar_url = "https://example.com/alice.png"
    bob.display_name = "Bob"
    db_session.add_all(
        [
            WorkoutSession(
                user_id=alice.id,
                started_at=datetime(2026, 6, 2, 8, 0, 0),
                duration_minutes=30,
                calories_burned=180,
                status="completed",
            ),
            WorkoutSession(
                user_id=bob.id,
                started_at=datetime(2026, 6, 3, 8, 0, 0),
                duration_minutes=50,
                calories_burned=310,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    refresh_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={
            "period_type": "weekly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-06",
        },
    )
    assert refresh_response.status_code == 200

    read_response = client.get(
        "/api/leaderboard?period_type=weekly&metric_type=duration_minutes",
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    assert read_response.status_code == 200
    assert read_response.json() == [
        {
            "display_name": "Bob",
            "avatar_url": None,
            "value": 50.0,
            "rank": 1,
            "period_type": "weekly",
            "metric_type": "duration_minutes",
        },
        {
            "display_name": "Alice",
            "avatar_url": "https://example.com/alice.png",
            "value": 30.0,
            "rank": 2,
            "period_type": "weekly",
            "metric_type": "duration_minutes",
        },
    ]
    assert "email" not in str(read_response.json())
    assert "user_id" not in str(read_response.json())
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
python -m pytest tests/test_leaderboard.py -v
```

Expected: FAIL with 404 responses because leaderboard routes are not registered.

- [ ] **Step 3: Add leaderboard schemas**

Create `backend/app/schemas/leaderboard.py`:

```python
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class LeaderboardRefreshRequest(BaseModel):
    period_type: str = Field(pattern="^(weekly|monthly)$")
    metric_type: str = Field(pattern="^(duration_minutes|calories_burned|sessions_count)$")
    anchor_date: date


class LeaderboardEntryResponse(BaseModel):
    display_name: str
    avatar_url: str | None
    value: float
    rank: int
    period_type: str
    metric_type: str
```

- [ ] **Step 4: Add leaderboard service**

Create `backend/app/services/leaderboard_service.py`:

```python
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import List

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.user import User
from app.models.workout_session import WorkoutSession


def get_period_bounds(period_type: str, anchor_date: date) -> tuple[date, date]:
    if period_type == "weekly":
        start = anchor_date - timedelta(days=anchor_date.weekday())
        end = start + timedelta(days=6)
        return start, end
    start = anchor_date.replace(day=1)
    if start.month == 12:
        next_month = start.replace(year=start.year + 1, month=1)
    else:
        next_month = start.replace(month=start.month + 1)
    return start, next_month - timedelta(days=1)


def _metric_expression(metric_type: str):
    if metric_type == "duration_minutes":
        return func.coalesce(func.sum(WorkoutSession.duration_minutes), 0)
    if metric_type == "calories_burned":
        return func.coalesce(func.sum(WorkoutSession.calories_burned), 0)
    return func.count(WorkoutSession.id)


def refresh_leaderboard(
    db: Session,
    period_type: str,
    metric_type: str,
    anchor_date: date,
) -> List[LeaderboardSnapshot]:
    period_start, period_end = get_period_bounds(period_type, anchor_date)
    start_dt = datetime.combine(period_start, time.min)
    end_dt = datetime.combine(period_end + timedelta(days=1), time.min)
    metric = _metric_expression(metric_type).label("value")

    rows = db.execute(
        select(User.id, User.display_name, User.avatar_url, metric)
        .join(WorkoutSession, WorkoutSession.user_id == User.id)
        .where(
            WorkoutSession.started_at >= start_dt,
            WorkoutSession.started_at < end_dt,
            WorkoutSession.status == "completed",
        )
        .group_by(User.id, User.display_name, User.avatar_url)
        .order_by(metric.desc(), User.id.asc())
    ).all()

    db.execute(
        delete(LeaderboardSnapshot).where(
            LeaderboardSnapshot.period_type == period_type,
            LeaderboardSnapshot.metric_type == metric_type,
            LeaderboardSnapshot.period_start == period_start,
            LeaderboardSnapshot.period_end == period_end,
        )
    )

    snapshots: list[LeaderboardSnapshot] = []
    for index, row in enumerate(rows, start=1):
        display_name = row.display_name or f"用户{row.id}"
        snapshot = LeaderboardSnapshot(
            period_type=period_type,
            metric_type=metric_type,
            period_start=period_start,
            period_end=period_end,
            user_id=row.id,
            display_name=display_name,
            avatar_url=row.avatar_url,
            value=float(row.value),
            rank=index,
        )
        db.add(snapshot)
        snapshots.append(snapshot)

    db.commit()
    for snapshot in snapshots:
        db.refresh(snapshot)
    return snapshots


def list_leaderboard(db: Session, period_type: str, metric_type: str) -> List[LeaderboardSnapshot]:
    statement = (
        select(LeaderboardSnapshot)
        .where(
            LeaderboardSnapshot.period_type == period_type,
            LeaderboardSnapshot.metric_type == metric_type,
        )
        .order_by(
            LeaderboardSnapshot.period_start.desc(),
            LeaderboardSnapshot.rank.asc(),
        )
    )
    latest_period = db.execute(statement.limit(1)).scalar_one_or_none()
    if latest_period is None:
        return []
    return list(
        db.execute(
            select(LeaderboardSnapshot)
            .where(
                LeaderboardSnapshot.period_type == period_type,
                LeaderboardSnapshot.metric_type == metric_type,
                LeaderboardSnapshot.period_start == latest_period.period_start,
                LeaderboardSnapshot.period_end == latest_period.period_end,
            )
            .order_by(LeaderboardSnapshot.rank.asc())
        ).scalars()
    )
```

- [ ] **Step 5: Add leaderboard route and register it**

Create `backend/app/api/routes/leaderboard.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.leaderboard import LeaderboardEntryResponse, LeaderboardRefreshRequest
from app.services.leaderboard_service import list_leaderboard, refresh_leaderboard

router = APIRouter()


@router.post("/refresh", response_model=list[LeaderboardEntryResponse])
def refresh_public_leaderboard(
    payload: LeaderboardRefreshRequest,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeaderboardEntryResponse]:
    return refresh_leaderboard(db, payload.period_type, payload.metric_type, payload.anchor_date)


@router.get("", response_model=list[LeaderboardEntryResponse])
def read_public_leaderboard(
    period_type: str = Query(pattern="^(weekly|monthly)$"),
    metric_type: str = Query(pattern="^(duration_minutes|calories_burned|sessions_count)$"),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeaderboardEntryResponse]:
    return list_leaderboard(db, period_type, metric_type)
```

Update `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api.routes import (
    admin_content,
    ai_configs,
    auth,
    catalog,
    health,
    leaderboard,
    users,
    workouts,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(admin_content.router, prefix="/admin", tags=["admin-content"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_leaderboard.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/router.py backend/app/api/routes/leaderboard.py backend/app/schemas/leaderboard.py backend/app/services/leaderboard_service.py backend/tests/test_leaderboard.py
git commit -m "feat: add public leaderboard APIs"
```

## Task 5: 前端 API client 与用户训练页面

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/user/TrainingPage.tsx`
- Create: `frontend/src/pages/user/LeaderboardPage.tsx`
- Modify: `frontend/src/routes/UserRoutes.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add frontend API contracts**

Modify `frontend/src/api/client.ts` by adding these exported types and functions after the existing AI config helpers:

```typescript
export type WorkoutMode = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  estimated_calories_per_hour: number;
  is_active: boolean;
};

export type Exercise = {
  id: number;
  slug: string;
  name: string;
  target_muscle: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string | null;
  tutorial_url: string | null;
  media_url: string | null;
  detection_rules: Record<string, unknown> | null;
  is_published: boolean;
};

export type WorkoutSession = {
  id: number;
  user_id: number;
  workout_mode_id: number | null;
  exercise_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  calories_burned: number;
  reps: number | null;
  score: number | null;
  status: "completed" | "abandoned";
  notes: string | null;
};

export type WorkoutSessionPayload = Omit<WorkoutSession, "id" | "user_id">;

export type WorkoutSummary = {
  sessions_count: number;
  total_duration_minutes: number;
  total_calories_burned: number;
};

export type LeaderboardEntry = {
  display_name: string;
  avatar_url: string | null;
  value: number;
  rank: number;
  period_type: "weekly" | "monthly";
  metric_type: "duration_minutes" | "calories_burned" | "sessions_count";
};

export function fetchWorkoutModes() {
  return apiRequest<WorkoutMode[]>("/catalog/workout-modes");
}

export function fetchExercises() {
  return apiRequest<Exercise[]>("/catalog/exercises");
}

export function fetchWorkoutSessions() {
  return apiRequest<WorkoutSession[]>("/workouts/sessions");
}

export function createWorkoutSession(payload: WorkoutSessionPayload) {
  return apiRequest<WorkoutSession>("/workouts/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchWorkoutSummary() {
  return apiRequest<WorkoutSummary>("/workouts/summary");
}

export function fetchLeaderboard(
  periodType: "weekly" | "monthly",
  metricType: "duration_minutes" | "calories_burned" | "sessions_count",
) {
  return apiRequest<LeaderboardEntry[]>(
    `/leaderboard?period_type=${periodType}&metric_type=${metricType}`,
  );
}
```

- [ ] **Step 2: Create user training page**

Create `frontend/src/pages/user/TrainingPage.tsx`:

```typescript
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Dumbbell, Plus, Timer } from "lucide-react";

import {
  Exercise,
  WorkoutMode,
  WorkoutSession,
  createWorkoutSession,
  fetchExercises,
  fetchWorkoutModes,
  fetchWorkoutSessions,
  fetchWorkoutSummary,
  WorkoutSummary,
} from "../../api/client";

function nowLocalIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function TrainingPage() {
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [startedAt, setStartedAt] = useState(nowLocalIso());
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [caloriesBurned, setCaloriesBurned] = useState("180");
  const [workoutModeId, setWorkoutModeId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    const [nextModes, nextExercises, nextSessions, nextSummary] = await Promise.all([
      fetchWorkoutModes(),
      fetchExercises(),
      fetchWorkoutSessions(),
      fetchWorkoutSummary(),
    ]);
    setModes(nextModes);
    setExercises(nextExercises);
    setSessions(nextSessions);
    setSummary(nextSummary);
  }

  useEffect(() => {
    void loadData().catch((error) => setMessage(error.message));
  }, []);

  const latestSessions = useMemo(() => sessions.slice(0, 5), [sessions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const startedDate = new Date(startedAt);
    const endedDate = new Date(startedDate.getTime() + Number(durationMinutes) * 60000);
    await createWorkoutSession({
      workout_mode_id: workoutModeId ? Number(workoutModeId) : null,
      exercise_id: exerciseId ? Number(exerciseId) : null,
      started_at: startedDate.toISOString(),
      ended_at: endedDate.toISOString(),
      duration_minutes: Number(durationMinutes),
      calories_burned: Number(caloriesBurned),
      reps: null,
      score: null,
      status: "completed",
      notes: notes || null,
    });
    setNotes("");
    setMessage("训练记录已保存");
    await loadData();
  }

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">训练</h2>
          <p className="mt-1 text-sm text-slate-600">选择运动模式并记录一次训练。</p>
        </div>
        <div className="rounded-md bg-gym-mint px-3 py-2 text-right text-sm text-gym-teal">
          <p className="font-semibold">{summary?.sessions_count ?? 0} 次</p>
          <p>{summary?.total_duration_minutes ?? 0} 分钟</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            开始时间
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            运动模式
            <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={workoutModeId} onChange={(event) => setWorkoutModeId(event.target.value)}>
              <option value="">自由训练</option>
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            动作
            <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
              <option value="">不指定动作</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            训练时长
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="1" max="1440" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700">
            消耗热量
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="number" min="0" max="10000" value={caloriesBurned} onChange={(event) => setCaloriesBurned(event.target.value)} required />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            备注
            <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
        </div>
        <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white" type="submit">
          <Plus size={18} aria-hidden="true" />
          保存训练
        </button>
        {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2 text-slate-950">
            <Timer size={18} aria-hidden="true" />
            <h3 className="font-semibold">累计</h3>
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{summary?.total_calories_burned ?? 0} kcal</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2 text-slate-950">
            <Dumbbell size={18} aria-hidden="true" />
            <h3 className="font-semibold">最近记录</h3>
          </div>
          <div className="mt-3 space-y-2">
            {latestSessions.map((session) => (
              <div key={session.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {session.duration_minutes} 分钟 · {session.calories_burned} kcal
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create user leaderboard page**

Create `frontend/src/pages/user/LeaderboardPage.tsx`:

```typescript
import { useEffect, useState } from "react";
import { Medal } from "lucide-react";

import { LeaderboardEntry, fetchLeaderboard } from "../../api/client";

type PeriodType = "weekly" | "monthly";
type MetricType = "duration_minutes" | "calories_burned" | "sessions_count";

const metricLabels: Record<MetricType, string> = {
  duration_minutes: "训练分钟",
  calories_burned: "消耗热量",
  sessions_count: "训练次数",
};

export default function LeaderboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [metricType, setMetricType] = useState<MetricType>("duration_minutes");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchLeaderboard(periodType, metricType)
      .then(setEntries)
      .catch((error) => setMessage(error.message));
  }, [metricType, periodType]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">榜单</h2>
        <p className="mt-1 text-sm text-slate-600">只展示公开身份和成绩。</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["weekly", "monthly"] as PeriodType[]).map((value) => (
          <button key={value} type="button" onClick={() => setPeriodType(value)} className={["rounded-md px-3 py-2 text-sm font-medium", periodType === value ? "bg-gym-teal text-white" : "bg-white text-slate-700"].join(" ")}>
            {value === "weekly" ? "周榜" : "月榜"}
          </button>
        ))}
        {(["duration_minutes", "calories_burned", "sessions_count"] as MetricType[]).map((value) => (
          <button key={value} type="button" onClick={() => setMetricType(value)} className={["rounded-md px-3 py-2 text-sm font-medium", metricType === value ? "bg-gym-coral text-white" : "bg-white text-slate-700"].join(" ")}>
            {metricLabels[value]}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={`${entry.rank}-${entry.display_name}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
                  <Medal size={18} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-slate-950">#{entry.rank} {entry.display_name}</p>
                  <p className="text-sm text-slate-600">{metricLabels[entry.metric_type]}</p>
                </div>
              </div>
              <p className="text-lg font-semibold text-slate-950">{entry.value}</p>
            </div>
          ))}
          {!entries.length ? <p className="text-sm text-slate-600">{message || "暂无榜单数据"}</p> : null}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Register user pages and navigation**

Update `frontend/src/routes/UserRoutes.tsx`:

```typescript
import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AiProviderSettingsPage from "../pages/user/AiProviderSettingsPage";
import HomePage from "../pages/user/HomePage";
import LeaderboardPage from "../pages/user/LeaderboardPage";
import ProfilePage from "../pages/user/ProfilePage";
import TrainingPage from "../pages/user/TrainingPage";

export default function UserRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="user" />}>
        <Route index element={<HomePage />} />
        <Route path="train" element={<TrainingPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="ai-settings" element={<AiProviderSettingsPage />} />
      </Route>
    </Routes>
  );
}
```

Update the user nav section in `frontend/src/components/Layout.tsx`:

```typescript
import { Activity, Bot, Dumbbell, Home, Settings, Shield, Trophy } from "lucide-react";

const userNavItems = [
  { to: "/app", label: "首页", icon: Home },
  { to: "/app/train", label: "训练", icon: Dumbbell },
  { to: "/app/leaderboard", label: "榜单", icon: Trophy },
  { to: "/app/ai-settings", label: "AI", icon: Bot },
  { to: "/app/profile", label: "我的", icon: Settings },
];
```

Update the mobile grid column expression in the same file:

```typescript
className={[
  "mx-auto grid max-w-md gap-2",
  isAdmin ? "grid-cols-2" : "grid-cols-5",
].join(" ")}
```

- [ ] **Step 5: Build frontend**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS and Vite writes `frontend/dist`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/Layout.tsx frontend/src/pages/user/LeaderboardPage.tsx frontend/src/pages/user/TrainingPage.tsx frontend/src/routes/UserRoutes.tsx
git commit -m "feat: add user training and leaderboard pages"
```

## Task 6: 前端管理端内容页面

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/admin/AdminContentPage.tsx`
- Modify: `frontend/src/routes/AdminRoutes.tsx`

- [ ] **Step 1: Add admin API client helpers**

Modify `frontend/src/api/client.ts` by adding these helpers after `fetchExercises()`:

```typescript
export type WorkoutModePayload = Omit<WorkoutMode, "id">;
export type ExercisePayload = Omit<Exercise, "id">;

export function createAdminWorkoutMode(payload: WorkoutModePayload) {
  return apiRequest<WorkoutMode>("/admin/workout-modes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminWorkoutMode(modeId: number, payload: Partial<WorkoutModePayload>) {
  return apiRequest<WorkoutMode>(`/admin/workout-modes/${modeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createAdminExercise(payload: ExercisePayload) {
  return apiRequest<Exercise>("/admin/exercises", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminExercise(exerciseId: number, payload: Partial<ExercisePayload>) {
  return apiRequest<Exercise>(`/admin/exercises/${exerciseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 2: Create admin content page**

Create `frontend/src/pages/admin/AdminContentPage.tsx`:

```typescript
import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Dumbbell, Plus } from "lucide-react";

import {
  Exercise,
  WorkoutMode,
  createAdminExercise,
  createAdminWorkoutMode,
  fetchExercises,
  fetchWorkoutModes,
} from "../../api/client";

export default function AdminContentPage() {
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modeName, setModeName] = useState("");
  const [modeCode, setModeCode] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [exerciseSlug, setExerciseSlug] = useState("");
  const [message, setMessage] = useState("");

  async function loadContent() {
    const [nextModes, nextExercises] = await Promise.all([fetchWorkoutModes(), fetchExercises()]);
    setModes(nextModes);
    setExercises(nextExercises);
  }

  useEffect(() => {
    void loadContent().catch((error) => setMessage(error.message));
  }, []);

  async function submitMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createAdminWorkoutMode({
      code: modeCode,
      name: modeName,
      description: "管理端创建的运动模式",
      estimated_calories_per_hour: 360,
      is_active: true,
    });
    setModeCode("");
    setModeName("");
    setMessage("运动模式已创建");
    await loadContent();
  }

  async function submitExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createAdminExercise({
      slug: exerciseSlug,
      name: exerciseName,
      target_muscle: "全身",
      difficulty: "beginner",
      description: "管理端创建的动作教程",
      tutorial_url: null,
      media_url: null,
      detection_rules: null,
      is_published: true,
    });
    setExerciseSlug("");
    setExerciseName("");
    setMessage("动作已创建");
    await loadContent();
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">内容管理</h2>
        <p className="mt-1 text-sm text-slate-600">维护运动模式、动作库和教程发布状态。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitMode} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2 text-slate-950">
            <Dumbbell size={18} aria-hidden="true" />
            <h3 className="font-semibold">运动模式</h3>
          </div>
          <div className="mt-4 grid gap-3">
            <input className="rounded-md border border-slate-300 px-3 py-2" value={modeCode} onChange={(event) => setModeCode(event.target.value)} placeholder="code，例如 strength" required />
            <input className="rounded-md border border-slate-300 px-3 py-2" value={modeName} onChange={(event) => setModeName(event.target.value)} placeholder="名称，例如 力量训练" required />
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white" type="submit">
              <Plus size={18} aria-hidden="true" />
              新增模式
            </button>
          </div>
        </form>

        <form onSubmit={submitExercise} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2 text-slate-950">
            <BookOpen size={18} aria-hidden="true" />
            <h3 className="font-semibold">动作教程</h3>
          </div>
          <div className="mt-4 grid gap-3">
            <input className="rounded-md border border-slate-300 px-3 py-2" value={exerciseSlug} onChange={(event) => setExerciseSlug(event.target.value)} placeholder="slug，例如 bodyweight-squat" required />
            <input className="rounded-md border border-slate-300 px-3 py-2" value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="名称，例如 徒手深蹲" required />
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-coral px-4 py-2 text-sm font-semibold text-white" type="submit">
              <Plus size={18} aria-hidden="true" />
              新增动作
            </button>
          </div>
        </form>
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="font-semibold text-slate-950">已发布模式</h3>
          <div className="mt-3 space-y-2">
            {modes.map((mode) => (
              <div key={mode.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{mode.name} · {mode.estimated_calories_per_hour} kcal/h</div>
            ))}
          </div>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="font-semibold text-slate-950">已发布动作</h3>
          <div className="mt-3 space-y-2">
            {exercises.map((exercise) => (
              <div key={exercise.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{exercise.name} · {exercise.target_muscle}</div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Register admin page**

Update `frontend/src/routes/AdminRoutes.tsx`:

```typescript
import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AdminContentPage from "../pages/admin/AdminContentPage";
import AdminHomePage from "../pages/admin/AdminHomePage";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="admin" />}>
        <Route index element={<AdminHomePage />} />
        <Route path="content" element={<AdminContentPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 4: Build frontend**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS and Vite writes `frontend/dist`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/admin/AdminContentPage.tsx frontend/src/routes/AdminRoutes.tsx
git commit -m "feat: add admin content management page"
```

## Task 7: End-to-end verification

**Files:**
- No source files expected.

- [ ] **Step 1: Run backend tests**

Run:

```bash
cd backend
python -m pytest -v
```

Expected: PASS for all backend tests, including existing phase 1 tests and new phase 2 tests.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start backend**

Run:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Expected: server starts at `http://127.0.0.1:8000`.

- [ ] **Step 4: Start frontend**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite starts at `http://127.0.0.1:5173`.

- [ ] **Step 5: Manual smoke test**

In the browser:

1. Register a user at `/register`.
2. Visit `/app/train`.
3. Confirm the page loads even when no content exists.
4. Create an admin user in the development database with the same password hashing helper used by `backend/app/core/security.py`.
5. Visit `/admin/content`.
6. Create one workout mode and one exercise.
7. Return to `/app/train`.
8. Confirm the new workout mode and exercise appear.
9. Save a workout session.
10. Trigger leaderboard refresh through API after logging in:

```bash
TOKEN="$(curl -s http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Passw0rd!"}' \
  | python -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

curl -s -X POST http://127.0.0.1:8000/api/leaderboard/refresh \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"period_type":"weekly","metric_type":"duration_minutes","anchor_date":"2026-06-06"}'
```

Expected: response contains rank, display name, avatar URL, value, period type, and metric type. Response must not include `email`, `user_id`, workout notes, or private session details.

- [ ] **Step 6: Final commit**

```bash
git status --short
git add backend frontend
git commit -m "feat: complete phase 2 training and leaderboard"
```

Expected: commit succeeds if Task 7 surfaced follow-up fixes. If there are no new changes after Task 6, `git status --short` is empty and this commit is skipped.

## Self-Review

Spec coverage:

- 第 2 期运动模式: Task 1 model, Task 2 admin/catalog API, Task 5/6 frontend.
- 第 2 期训练记录: Task 1 model, Task 3 API, Task 5 frontend.
- 第 2 期公开榜单: Task 1 model, Task 4 API, Task 5 frontend.
- 第 2 期动作和教程内容管理: Task 1 model, Task 2 API, Task 6 frontend.
- 数据隔离: Task 3 tests assert current-user filtering; Task 4 response omits email and user ID.
- 管理员专属内容变更: Task 2 tests assert normal user receives 403.

Placeholder scan:

- The plan avoids undefined placeholders and future-fill instructions.
- Every task has concrete files, tests, commands, and expected results.

Type consistency:

- Backend `WorkoutMode`, `Exercise`, `WorkoutSession`, and `LeaderboardSnapshot` fields match schema names.
- Frontend API types mirror backend response fields.
- Route paths are consistently registered under `/api/admin`, `/api/catalog`, `/api/workouts`, and `/api/leaderboard`.
