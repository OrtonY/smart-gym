# Nutrition Plan Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a nutrition planning loop where users generate and adjust meal plans through AI conversation, log food through recognition or manual entry, reconcile yesterday at local midnight, and view today plus recent 7-day calorie intake.

**Architecture:** Add a nutrition-plan model family that mirrors training plans: plans, versions, and meal items hold the intended diet, while existing `nutrition_logs` remain the source of truth for actual intake. Backend services handle AI parsing, version replacement, log-to-meal attribution, summary aggregation, and reconciliation; the React nutrition page consumes a summary endpoint instead of deriving business state locally.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, Pydantic, pytest, React, TypeScript, Vite, Tailwind CSS, lucide-react.

---

## Scope Check

The spec is one coherent subsystem: nutrition planning and nutrition intake reconciliation. It touches AI, nutrition APIs, persistence, and the nutrition page, but every change serves one user workflow and can be delivered behind existing authenticated user routes.

## File Structure

Create:

- `backend/app/models/nutrition_plan.py`: nutrition plan header.
- `backend/app/models/nutrition_plan_version.py`: version metadata for generated or adjusted plans.
- `backend/app/models/nutrition_plan_meal.py`: per-date, per-meal planned and actual intake.
- `backend/app/schemas/nutrition_plans.py`: Pydantic request and response models for plans, meals, AI requests, summary, and reconciliation.
- `backend/app/services/nutrition_plan_service.py`: plan CRUD, version creation, meal replacement, log attribution, and aggregate recalculation.
- `backend/app/services/nutrition_reconciliation_service.py`: local-date reconciliation for yesterday or supplied test dates.
- `backend/app/migrations/versions/20260607_nutrition_plan_refactor.py`: tables and `nutrition_logs.nutrition_plan_meal_id`.
- `backend/tests/test_nutrition_plan_models.py`: model persistence tests.
- `backend/tests/test_nutrition_plans.py`: plan API and AI generation tests.
- `backend/tests/test_nutrition_reconciliation.py`: attribution, summary, and reconciliation tests.

Modify:

- `backend/app/models/__init__.py`: import new models.
- `backend/tests/conftest.py`: include new models in metadata creation.
- `backend/app/models/nutrition_log.py`: add nullable FK to planned meal.
- `backend/app/models/ai_conversation.py`: add nullable FK to nutrition plan for AI chat history.
- `backend/app/schemas/nutrition.py`: expose `nutrition_plan_meal_id`.
- `backend/app/services/nutrition_service.py`: attribute created or corrected logs and recalculate aggregates.
- `backend/app/api/routes/nutrition.py`: add plan, summary, and reconcile endpoints; wire attribution into existing log endpoints.
- `backend/app/api/routes/ai_coach.py`: add nutrition plan generate and adjust routes.
- `backend/app/services/ai_service.py`: add nutrition-plan AI prompt, parsing, fake responses, and service entry points.
- `frontend/src/api/client.ts`: add nutrition-plan, summary, and AI helper types/functions.
- `frontend/src/pages/user/NutritionPage.tsx`: refactor to today-first nutrition planning UI.

Do not commit `.superpowers/`; it is browser brainstorming state.

---

### Task 1: Models and Migration

**Files:**
- Create: `backend/app/models/nutrition_plan.py`
- Create: `backend/app/models/nutrition_plan_version.py`
- Create: `backend/app/models/nutrition_plan_meal.py`
- Create: `backend/app/migrations/versions/20260607_nutrition_plan_refactor.py`
- Modify: `backend/app/models/nutrition_log.py`
- Modify: `backend/app/models/ai_conversation.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_nutrition_plan_models.py`

- [ ] **Step 1: Write failing model tests**

Create `backend/tests/test_nutrition_plan_models.py`:

```python
from datetime import date, datetime

from app.models.nutrition_log import NutritionLog
from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion


def test_nutrition_plan_version_and_meal_persist(db_session, create_user_and_token):
    user, _ = create_user_and_token("nutrition-plan-model@example.com")
    plan = NutritionPlan(
        user_id=user.id,
        title="7 天高蛋白饮食",
        source="ai_generated",
        current_version=1,
        is_active=True,
        start_date=date(2026, 6, 7),
        end_date=date(2026, 6, 13),
        days_count=7,
    )
    db_session.add(plan)
    db_session.flush()
    version = NutritionPlanVersion(
        nutrition_plan_id=plan.id,
        version_number=1,
        source="ai_generated",
        user_prompt="默认生成 7 天，高蛋白",
        change_summary="AI 生成",
    )
    meal = NutritionPlanMeal(
        nutrition_plan_id=plan.id,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        meal_type="breakfast",
        sort_order=0,
        title="燕麦鸡蛋早餐",
        food_items=[{"name": "燕麦", "portion": "50g"}],
        portion_notes="燕麦 50g，鸡蛋 2 个",
        target_calories_kcal=450,
        target_protein_g=28.0,
        target_carbs_g=48.0,
        target_fat_g=14.0,
        status="planned",
    )
    db_session.add_all([version, meal])
    db_session.commit()

    saved = db_session.get(NutritionPlanMeal, meal.id)

    assert saved is not None
    assert saved.food_items[0]["name"] == "燕麦"
    assert saved.status == "planned"
    assert saved.actual_calories_kcal == 0


def test_nutrition_log_can_reference_plan_meal(db_session, create_user_and_token):
    user, _ = create_user_and_token("nutrition-log-plan-meal@example.com")
    plan = NutritionPlan(
        user_id=user.id,
        title="测试饮食计划",
        source="ai_generated",
        current_version=1,
        is_active=True,
        start_date=date(2026, 6, 7),
        end_date=date(2026, 6, 7),
        days_count=1,
    )
    db_session.add(plan)
    db_session.flush()
    meal = NutritionPlanMeal(
        nutrition_plan_id=plan.id,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        meal_type="lunch",
        sort_order=1,
        title="午餐",
        target_calories_kcal=650,
        status="planned",
    )
    db_session.add(meal)
    db_session.flush()
    log = NutritionLog(
        user_id=user.id,
        nutrition_plan_meal_id=meal.id,
        logged_at=datetime(2026, 6, 7, 12, 0, 0),
        meal_type="lunch",
        food_name="鸡胸肉沙拉",
        calories_kcal=420,
    )
    db_session.add(log)
    db_session.commit()

    saved = db_session.get(NutritionLog, log.id)

    assert saved is not None
    assert saved.nutrition_plan_meal_id == meal.id
```

- [ ] **Step 2: Run model test to verify it fails**

Run:

```bash
cd backend && pytest tests/test_nutrition_plan_models.py -v
```

Expected: FAIL with an import error for `app.models.nutrition_plan`.

- [ ] **Step 3: Add SQLAlchemy models**

Create `backend/app/models/nutrition_plan.py`:

```python
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NutritionPlan(Base):
    __tablename__ = "nutrition_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    start_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    days_count: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
```

Create `backend/app/models/nutrition_plan_version.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NutritionPlanVersion(Base):
    __tablename__ = "nutrition_plan_versions"
    __table_args__ = (
        UniqueConstraint(
            "nutrition_plan_id",
            "version_number",
            name="uq_nutrition_plan_version_number",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nutrition_plan_id: Mapped[int] = mapped_column(
        ForeignKey("nutrition_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="manual")
    user_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
```

Create `backend/app/models/nutrition_plan_meal.py`:

```python
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NutritionPlanMeal(Base):
    __tablename__ = "nutrition_plan_meals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nutrition_plan_id: Mapped[int] = mapped_column(
        ForeignKey("nutrition_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    scheduled_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    meal_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    food_items: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    portion_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_calories_kcal: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_carbs_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_fat_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    actual_calories_kcal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_protein_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_carbs_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_fat_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_reconciled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
```

- [ ] **Step 4: Wire model imports and NutritionLog FK**

Add imports and `__all__` entries in `backend/app/models/__init__.py`:

```python
from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion
```

Add these names to `__all__`:

```python
"NutritionPlan",
"NutritionPlanMeal",
"NutritionPlanVersion",
```

Modify `backend/tests/conftest.py` by importing the three models and adding them to `_models` after `NutritionLog`.

Modify `backend/app/models/nutrition_log.py`:

```python
nutrition_plan_meal_id: Mapped[Optional[int]] = mapped_column(
    ForeignKey("nutrition_plan_meals.id", ondelete="SET NULL"),
    index=True,
    nullable=True,
)
```

Modify `backend/app/models/ai_conversation.py`:

```python
nutrition_plan_id: Mapped[Optional[int]] = mapped_column(
    ForeignKey("nutrition_plans.id", ondelete="SET NULL"), nullable=True
)
```

- [ ] **Step 5: Add Alembic migration**

Create `backend/app/migrations/versions/20260607_nutrition_plan_refactor.py` with `down_revision = "20260607_training_loop_refactor"` and tables matching the model fields. Include:

```python
op.add_column(
    "nutrition_logs",
    sa.Column("nutrition_plan_meal_id", sa.Integer(), nullable=True),
)
op.create_foreign_key(
    "fk_nutrition_logs_nutrition_plan_meal_id",
    "nutrition_logs",
    "nutrition_plan_meals",
    ["nutrition_plan_meal_id"],
    ["id"],
    ondelete="SET NULL",
)
op.create_index(
    op.f("ix_nutrition_logs_nutrition_plan_meal_id"),
    "nutrition_logs",
    ["nutrition_plan_meal_id"],
)
op.add_column(
    "ai_conversations",
    sa.Column("nutrition_plan_id", sa.Integer(), nullable=True),
)
op.create_foreign_key(
    "fk_ai_conversations_nutrition_plan_id",
    "ai_conversations",
    "nutrition_plans",
    ["nutrition_plan_id"],
    ["id"],
    ondelete="SET NULL",
)
```

The downgrade drops the `ai_conversations` FK and column, the nutrition log index/FK/column, and the three new tables in reverse dependency order.

- [ ] **Step 6: Run model tests**

Run:

```bash
cd backend && pytest tests/test_nutrition_plan_models.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit model layer**

```bash
git add backend/app/models backend/app/migrations/versions/20260607_nutrition_plan_refactor.py backend/tests/conftest.py backend/tests/test_nutrition_plan_models.py
git commit -m "feat: add nutrition plan models"
```

---

### Task 2: Schemas and Nutrition Plan Service

**Files:**
- Create: `backend/app/schemas/nutrition_plans.py`
- Create: `backend/app/services/nutrition_plan_service.py`
- Modify: `backend/app/schemas/nutrition.py`
- Test: `backend/tests/test_nutrition_plans.py`

- [ ] **Step 1: Write failing service tests for manual plan creation and versioning**

Create `backend/tests/test_nutrition_plans.py`:

```python
from datetime import date

from app.schemas.nutrition_plans import (
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)
from app.services.nutrition_plan_service import (
    create_nutrition_plan,
    get_nutrition_plan_detail,
    replace_nutrition_plan_meals,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _meal(day: date, meal_type: str, calories: int = 450) -> NutritionPlanMealCreate:
    return NutritionPlanMealCreate(
        scheduled_date=day,
        meal_type=meal_type,
        sort_order=0,
        title=f"{meal_type} 测试餐",
        food_items=[{"name": "燕麦", "portion": "50g"}],
        portion_notes="燕麦 50g",
        target_calories_kcal=calories,
        target_protein_g=25.0,
        target_carbs_g=50.0,
        target_fat_g=12.0,
        notes="少油",
    )


def test_create_nutrition_plan_deactivates_existing_active_plan(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("nutrition-plan-service@example.com")
    first = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="旧计划",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 7),
            days_count=7,
            meals=[_meal(date(2026, 6, 1), "breakfast")],
            change_summary="旧计划",
        ),
        source="ai_generated",
        user_prompt="旧计划",
    )
    second = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="新计划",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 13),
            days_count=7,
            meals=[_meal(date(2026, 6, 7), "breakfast")],
            change_summary="新计划",
        ),
        source="ai_generated",
        user_prompt="新计划",
    )

    db_session.refresh(first)
    db_session.refresh(second)

    assert first.is_active is False
    assert second.is_active is True


def test_replace_nutrition_plan_meals_creates_new_version(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("nutrition-plan-replace@example.com")
    plan = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="饮食计划",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[_meal(date(2026, 6, 7), "breakfast")],
            change_summary="AI 生成",
        ),
        source="ai_generated",
        user_prompt="生成一天",
    )

    updated = replace_nutrition_plan_meals(
        db_session,
        user.id,
        plan.id,
        NutritionPlanMealsReplace(
            meals=[_meal(date(2026, 6, 7), "lunch", calories=650)],
            change_summary="早餐改午餐",
            user_prompt="改成午餐",
        ),
        source="ai_adjusted",
    )
    detail = get_nutrition_plan_detail(db_session, user.id, plan.id)

    assert updated is not None
    assert updated.current_version == 2
    assert detail is not None
    assert len(detail["items"]) == 1
    assert detail["items"][0].version_number == 2
    assert detail["items"][0].meal_type == "lunch"
    assert len(detail["versions"]) == 2
```

- [ ] **Step 2: Run service tests to verify they fail**

Run:

```bash
cd backend && pytest tests/test_nutrition_plans.py::test_create_nutrition_plan_deactivates_existing_active_plan tests/test_nutrition_plans.py::test_replace_nutrition_plan_meals_creates_new_version -v
```

Expected: FAIL with missing `app.schemas.nutrition_plans`.

- [ ] **Step 3: Add nutrition plan schemas**

Create `backend/app/schemas/nutrition_plans.py` with these core types:

```python
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NutritionPlanMealBase(BaseModel):
    scheduled_date: date
    meal_type: str = Field(pattern="^(breakfast|lunch|dinner|snack)$")
    sort_order: int = Field(default=0, ge=0, le=1000)
    title: str = Field(min_length=1, max_length=160)
    food_items: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    portion_notes: Optional[str] = Field(default=None, max_length=2_000)
    target_calories_kcal: Optional[int] = Field(default=None, ge=0, le=10_000)
    target_protein_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    target_carbs_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    target_fat_g: Optional[float] = Field(default=None, ge=0, le=1_000)
    notes: Optional[str] = Field(default=None, max_length=2_000)
    status: str = Field(
        default="planned",
        pattern="^(planned|logged|partial|over_target|missed)$",
    )

    model_config = ConfigDict(extra="forbid")


class NutritionPlanMealCreate(NutritionPlanMealBase):
    pass


class NutritionPlanMealResponse(NutritionPlanMealBase):
    id: int
    nutrition_plan_id: int
    version_number: int
    actual_calories_kcal: int
    actual_protein_g: Optional[float]
    actual_carbs_g: Optional[float]
    actual_fat_g: Optional[float]
    last_reconciled_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    start_date: date
    end_date: date
    days_count: int = Field(ge=1, le=14)
    meals: list[NutritionPlanMealCreate] = Field(min_length=1, max_length=56)
    change_summary: Optional[str] = Field(default=None, max_length=2_000)

    @model_validator(mode="after")
    def validate_dates(self) -> "NutritionPlanCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self

    model_config = ConfigDict(extra="forbid")


class NutritionPlanMealsReplace(BaseModel):
    meals: list[NutritionPlanMealCreate] = Field(min_length=1, max_length=56)
    change_summary: Optional[str] = Field(default=None, max_length=2_000)
    user_prompt: Optional[str] = Field(default=None, max_length=4_000)

    model_config = ConfigDict(extra="forbid")


class NutritionPlanVersionResponse(BaseModel):
    id: int
    nutrition_plan_id: int
    version_number: int
    source: str
    user_prompt: Optional[str]
    change_summary: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanSummaryResponse(BaseModel):
    id: int
    user_id: int
    title: str
    source: str
    current_version: int
    is_active: bool
    start_date: date
    end_date: date
    days_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NutritionPlanDetailResponse(NutritionPlanSummaryResponse):
    items: list[NutritionPlanMealResponse]
    versions: list[NutritionPlanVersionResponse]
```

Modify `backend/app/schemas/nutrition.py` so `NutritionLogResponse` includes:

```python
nutrition_plan_meal_id: Optional[int] = None
```

- [ ] **Step 4: Add nutrition plan service functions**

Create `backend/app/services/nutrition_plan_service.py` with:

```python
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion
from app.schemas.nutrition_plans import (
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)


def _get_owned_plan(db: Session, user_id: int, plan_id: int) -> Optional[NutritionPlan]:
    return (
        db.execute(
            select(NutritionPlan).where(
                NutritionPlan.id == plan_id,
                NutritionPlan.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )


def _deactivate_other_plans(db: Session, user_id: int) -> None:
    plans = db.execute(
        select(NutritionPlan).where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
        )
    ).scalars()
    for plan in plans:
        plan.is_active = False
        plan.updated_at = datetime.utcnow()


def _create_version(
    db: Session,
    plan_id: int,
    version_number: int,
    source: str,
    user_prompt: Optional[str],
    change_summary: Optional[str],
) -> NutritionPlanVersion:
    version = NutritionPlanVersion(
        nutrition_plan_id=plan_id,
        version_number=version_number,
        source=source,
        user_prompt=user_prompt,
        change_summary=change_summary,
    )
    db.add(version)
    return version


def _create_meals(
    db: Session,
    plan_id: int,
    version_number: int,
    meals: list[NutritionPlanMealCreate],
) -> list[NutritionPlanMeal]:
    created = [
        NutritionPlanMeal(
            nutrition_plan_id=plan_id,
            version_number=version_number,
            actual_calories_kcal=0,
            **meal.model_dump(),
        )
        for meal in meals
    ]
    db.add_all(created)
    return created


def create_nutrition_plan(
    db: Session,
    user_id: int,
    payload: NutritionPlanCreate,
    source: str = "manual",
    user_prompt: Optional[str] = None,
) -> NutritionPlan:
    _deactivate_other_plans(db, user_id)
    plan = NutritionPlan(
        user_id=user_id,
        title=payload.title,
        source=source,
        current_version=1,
        is_active=True,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=payload.days_count,
    )
    db.add(plan)
    db.flush()
    _create_version(db, plan.id, 1, source, user_prompt, payload.change_summary)
    _create_meals(db, plan.id, 1, payload.meals)
    db.commit()
    db.refresh(plan)
    return plan


def list_nutrition_plans(db: Session, user_id: int) -> list[NutritionPlan]:
    statement = (
        select(NutritionPlan)
        .where(NutritionPlan.user_id == user_id)
        .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
    )
    return list(db.execute(statement).scalars())


def list_nutrition_plan_versions(
    db: Session, user_id: int, plan_id: int
) -> Optional[list[NutritionPlanVersion]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    statement = (
        select(NutritionPlanVersion)
        .where(NutritionPlanVersion.nutrition_plan_id == plan.id)
        .order_by(desc(NutritionPlanVersion.version_number))
    )
    return list(db.execute(statement).scalars())


def list_nutrition_plan_meals(
    db: Session,
    user_id: int,
    plan_id: int,
    version_number: Optional[int] = None,
) -> Optional[list[NutritionPlanMeal]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    effective_version = version_number or plan.current_version
    statement = (
        select(NutritionPlanMeal)
        .where(
            NutritionPlanMeal.nutrition_plan_id == plan.id,
            NutritionPlanMeal.version_number == effective_version,
        )
        .order_by(
            NutritionPlanMeal.scheduled_date,
            NutritionPlanMeal.sort_order,
            NutritionPlanMeal.id,
        )
    )
    return list(db.execute(statement).scalars())


def get_nutrition_plan_detail(
    db: Session, user_id: int, plan_id: int
) -> Optional[dict[str, object]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "title": plan.title,
        "source": plan.source,
        "current_version": plan.current_version,
        "is_active": plan.is_active,
        "start_date": plan.start_date,
        "end_date": plan.end_date,
        "days_count": plan.days_count,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "items": list_nutrition_plan_meals(db, user_id, plan.id) or [],
        "versions": list_nutrition_plan_versions(db, user_id, plan.id) or [],
    }


def replace_nutrition_plan_meals(
    db: Session,
    user_id: int,
    plan_id: int,
    payload: NutritionPlanMealsReplace,
    source: str = "manual",
) -> Optional[NutritionPlan]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    next_version = plan.current_version + 1
    plan.current_version = next_version
    plan.start_date = min(meal.scheduled_date for meal in payload.meals)
    plan.end_date = max(meal.scheduled_date for meal in payload.meals)
    plan.days_count = len({meal.scheduled_date for meal in payload.meals})
    plan.updated_at = datetime.utcnow()
    _create_version(
        db,
        plan.id,
        next_version,
        source,
        payload.user_prompt,
        payload.change_summary,
    )
    _create_meals(db, plan.id, next_version, payload.meals)
    db.commit()
    db.refresh(plan)
    return plan
```

- [ ] **Step 5: Run service tests**

Run:

```bash
cd backend && pytest tests/test_nutrition_plans.py::test_create_nutrition_plan_deactivates_existing_active_plan tests/test_nutrition_plans.py::test_replace_nutrition_plan_meals_creates_new_version -v
```

Expected: PASS.

- [ ] **Step 6: Commit schemas and service**

```bash
git add backend/app/schemas/nutrition.py backend/app/schemas/nutrition_plans.py backend/app/services/nutrition_plan_service.py backend/tests/test_nutrition_plans.py
git commit -m "feat: add nutrition plan service"
```

---

### Task 3: AI Nutrition Plan Generation and Adjustment

**Files:**
- Modify: `backend/app/schemas/nutrition_plans.py`
- Modify: `backend/app/services/ai_service.py`
- Modify: `backend/app/api/routes/ai_coach.py`
- Test: `backend/tests/test_nutrition_plans.py`

- [ ] **Step 1: Add failing AI route tests**

Append to `backend/tests/test_nutrition_plans.py`:

```python
from app.models.ai_provider_config import AiProviderConfig
from app.services.ai_config_service import encrypt_api_key


def _provider(user_id: int) -> AiProviderConfig:
    return AiProviderConfig(
        user_id=user_id,
        provider_type="openai-compatible",
        base_url="https://example.test/v1",
        model_name="test-model",
        api_key_encrypted=encrypt_api_key("test-key"),
        is_active=True,
    )


def test_ai_generates_default_seven_day_nutrition_plan(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-default@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "高蛋白，少油"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["plan"]["days_count"] == 7
    assert len(data["plan"]["items"]) == 28
    assert data["plan"]["items"][0]["meal_type"] == "breakfast"
    assert data["conversation_id"] > 0


def test_ai_respects_prompt_day_count(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-three@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "生成 3 天，早餐不要牛奶"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["plan"]["days_count"] == 3
    assert len(data["plan"]["items"]) == 12


def test_ai_adjustment_creates_new_nutrition_plan_version(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-adjust@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    created = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "生成 3 天"},
    ).json()
    plan_id = created["plan"]["id"]

    response = client.post(
        f"/api/ai-coach/nutrition-plans/{plan_id}/adjust",
        headers=_auth(token),
        json={"prompt": "未来 3 天晚餐更清淡"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["plan"]["current_version"] == 2
    assert data["plan"]["versions"][0]["user_prompt"] == "未来 3 天晚餐更清淡"
```

- [ ] **Step 2: Run AI route tests to verify they fail**

Run:

```bash
cd backend && pytest tests/test_nutrition_plans.py::test_ai_generates_default_seven_day_nutrition_plan tests/test_nutrition_plans.py::test_ai_respects_prompt_day_count tests/test_nutrition_plans.py::test_ai_adjustment_creates_new_nutrition_plan_version -v
```

Expected: FAIL with 404 for the new AI endpoints.

- [ ] **Step 3: Add AI request/response schemas**

Append to `backend/app/schemas/nutrition_plans.py`:

```python
class GenerateNutritionPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4_000)
    start_date: Optional[date] = None

    model_config = ConfigDict(extra="forbid")


class AdjustNutritionPlanRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4_000)

    model_config = ConfigDict(extra="forbid")


class AiNutritionPlanResponse(BaseModel):
    conversation_id: int
    plan: NutritionPlanDetailResponse
```

- [ ] **Step 4: Add nutrition-plan AI parser and fake response**

In `backend/app/services/ai_service.py`, import nutrition schemas and service functions:

```python
from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.schemas.nutrition_plans import (
    AdjustNutritionPlanRequest,
    GenerateNutritionPlanRequest,
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)
from app.services.nutrition_plan_service import (
    create_nutrition_plan,
    get_nutrition_plan_detail,
    replace_nutrition_plan_meals,
)
```

Add constants and helpers near the existing AI prompts:

```python
NUTRITION_PLAN_SYSTEM_PROMPT = (
    "Return only JSON with keys title, start_date, days_count, change_summary, meals. "
    "days_count must be 1-14. meals must include one breakfast, lunch, dinner, and snack "
    "per day. Each meal must include scheduled_date as YYYY-MM-DD, meal_type, sort_order, "
    "title, food_items array, portion_notes, target_calories_kcal, target_protein_g, "
    "target_carbs_g, target_fat_g, notes. Use Chinese for titles and notes."
)

MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]


def _requested_nutrition_days(prompt: str) -> int:
    match = re.search(r"(\d+)\s*天", prompt)
    if match is None:
        return 7
    days = int(match.group(1))
    if days < 1 or days > 14:
        raise AiCoachError("Nutrition plan days must be between 1 and 14")
    return days


def _fake_nutrition_plan(prompt: str, start_date: date) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    days = _requested_nutrition_days(prompt)
    meals: list[NutritionPlanMealCreate] = []
    templates = {
        "breakfast": ("燕麦鸡蛋早餐", 450, 28.0, 48.0, 14.0),
        "lunch": ("鸡胸肉糙米午餐", 650, 42.0, 72.0, 18.0),
        "dinner": ("清淡鱼肉晚餐", 560, 38.0, 45.0, 16.0),
        "snack": ("酸奶坚果加餐", 220, 14.0, 18.0, 10.0),
    }
    for offset in range(days):
        scheduled_date = start_date + timedelta(days=offset)
        for sort_order, meal_type in enumerate(MEAL_TYPES):
            title, calories, protein, carbs, fat = templates[meal_type]
            meals.append(
                NutritionPlanMealCreate(
                    scheduled_date=scheduled_date,
                    meal_type=meal_type,
                    sort_order=sort_order,
                    title=title,
                    food_items=[{"name": title, "portion": "1 份"}],
                    portion_notes="按一人份估算，可按饱腹感微调",
                    target_calories_kcal=calories,
                    target_protein_g=protein,
                    target_carbs_g=carbs,
                    target_fat_g=fat,
                    notes="少油烹饪，优先选择天然食材",
                )
            )
    return "AI 饮食计划", days, meals, "AI 生成"
```

Add this parser:

```python
def _parse_nutrition_plan_content(
    content: str, fallback_start: date
) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    try:
        data = json.loads(_strip_json_fence(content))
    except (TypeError, json.JSONDecodeError) as exc:
        raise AiCoachError("AI provider returned invalid nutrition plan JSON") from exc
    if not isinstance(data, dict):
        raise AiCoachError("AI provider returned invalid nutrition plan JSON")

    title = str(data.get("title") or "AI 饮食计划")
    raw_days = _parse_optional_int(data.get("days_count")) or 7
    if raw_days < 1 or raw_days > 14:
        raise AiCoachError("Nutrition plan days must be between 1 and 14")
    raw_meals = data.get("meals")
    if not isinstance(raw_meals, list) or not raw_meals:
        raise AiCoachError("AI provider returned no nutrition meals")

    meals: list[NutritionPlanMealCreate] = []
    for index, raw_meal in enumerate(raw_meals):
        if not isinstance(raw_meal, dict):
            raise AiCoachError("AI provider returned invalid nutrition meal")
        normalized = {
            "scheduled_date": raw_meal.get("scheduled_date")
            or raw_meal.get("date")
            or fallback_start.isoformat(),
            "meal_type": raw_meal.get("meal_type"),
            "sort_order": _parse_optional_int(raw_meal.get("sort_order")) or index,
            "title": raw_meal.get("title") or raw_meal.get("name") or "计划餐",
            "food_items": raw_meal.get("food_items") or [],
            "portion_notes": _normalize_notes(raw_meal.get("portion_notes")),
            "target_calories_kcal": _bounded_int(
                raw_meal.get("target_calories_kcal") or raw_meal.get("calories_kcal"),
                10_000,
            ),
            "target_protein_g": _bounded_float(
                raw_meal.get("target_protein_g") or raw_meal.get("protein_g"), 1_000
            ),
            "target_carbs_g": _bounded_float(
                raw_meal.get("target_carbs_g") or raw_meal.get("carbs_g"), 1_000
            ),
            "target_fat_g": _bounded_float(
                raw_meal.get("target_fat_g") or raw_meal.get("fat_g"), 1_000
            ),
            "notes": _normalize_notes(raw_meal.get("notes")),
        }
        try:
            meals.append(NutritionPlanMealCreate.model_validate(normalized))
        except ValueError as exc:
            raise AiCoachError("AI provider returned invalid nutrition meal") from exc

    return title, raw_days, meals, str(data.get("change_summary") or "AI 生成")
```

- [ ] **Step 5: Add generate and adjust service entry points**

Add to `backend/app/services/ai_service.py`:

```python
def generate_nutrition_plan_items(
    config: AiProviderConfig, prompt: str, start_date: date
) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return _fake_nutrition_plan(prompt, start_date)
    messages = [
        {"role": "system", "content": NUTRITION_PLAN_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        content = _call_text_openai_compatible(config, messages)
    elif config.provider_type == "ollama":
        content = _call_text_ollama(config, messages)
    else:
        raise AiCoachError("Unsupported AI provider")
    return _parse_nutrition_plan_content(content, start_date)


def generate_ai_nutrition_plan(
    db: Session, user_id: int, payload: GenerateNutritionPlanRequest
) -> dict[str, object]:
    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")
    start_date = payload.start_date or date.today()
    days = _requested_nutrition_days(payload.prompt)
    prompt = "\n".join(
        [
            f"Today: {date.today().isoformat()}",
            f"Start date: {start_date.isoformat()}",
            f"Default days: {days}",
            f"User request: {payload.prompt}",
        ]
    )
    title, days_count, meals, change_summary = generate_nutrition_plan_items(
        config, prompt, start_date
    )
    plan = create_nutrition_plan(
        db,
        user_id,
        NutritionPlanCreate(
            title=title,
            start_date=min(meal.scheduled_date for meal in meals),
            end_date=max(meal.scheduled_date for meal in meals),
            days_count=days_count,
            meals=meals,
            change_summary=change_summary,
        ),
        source="ai_generated",
        user_prompt=payload.prompt,
    )
    conversation = AiConversation(
        user_id=user_id,
        topic="nutrition_plan",
        nutrition_plan_id=plan.id,
    )
    db.add(conversation)
    db.flush()
    _create_message(db, conversation.id, "user", payload.prompt)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps({"title": title, "items": [meal.model_dump() for meal in meals]}, ensure_ascii=False, default=str),
        config=config,
        metadata_json={"action": "generate_nutrition_plan"},
    )
    db.commit()
    db.refresh(conversation)
    detail = get_nutrition_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Nutrition plan not found")
    return {"conversation_id": conversation.id, "plan": detail}
```

Add this adjustment entry point:

```python
def _latest_nutrition_plan_conversation(
    db: Session, user_id: int, plan_id: int
) -> Optional[AiConversation]:
    return (
        db.execute(
            select(AiConversation)
            .where(
                AiConversation.user_id == user_id,
                AiConversation.nutrition_plan_id == plan_id,
                AiConversation.topic == "nutrition_plan",
            )
            .order_by(desc(AiConversation.updated_at), desc(AiConversation.id))
        )
        .scalars()
        .first()
    )


def adjust_ai_nutrition_plan(
    db: Session, user_id: int, plan_id: int, payload: AdjustNutritionPlanRequest
) -> Optional[dict[str, object]]:
    existing_detail = get_nutrition_plan_detail(db, user_id, plan_id)
    if existing_detail is None:
        return None
    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")

    current_items = existing_detail["items"]
    start_date = min(item.scheduled_date for item in current_items)
    current_summary = [
        {
            "scheduled_date": item.scheduled_date.isoformat(),
            "meal_type": item.meal_type,
            "title": item.title,
            "target_calories_kcal": item.target_calories_kcal,
        }
        for item in current_items
    ]
    prompt = json.dumps(
        {
            "current_plan": current_summary,
            "user_request": payload.prompt,
            "instruction": "Return the full adjusted meal list, not a patch.",
        },
        ensure_ascii=False,
        default=str,
    )
    _, _, meals, change_summary = generate_nutrition_plan_items(
        config, prompt, start_date
    )
    plan = replace_nutrition_plan_meals(
        db,
        user_id,
        plan_id,
        NutritionPlanMealsReplace(
            meals=meals,
            change_summary=change_summary,
            user_prompt=payload.prompt,
        ),
        source="ai_adjusted",
    )
    if plan is None:
        return None

    conversation = _latest_nutrition_plan_conversation(db, user_id, plan_id)
    if conversation is None:
        conversation = AiConversation(
            user_id=user_id,
            topic="nutrition_plan",
            nutrition_plan_id=plan_id,
        )
        db.add(conversation)
        db.flush()
    _create_message(db, conversation.id, "user", payload.prompt)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps({"items": [meal.model_dump() for meal in meals]}, ensure_ascii=False, default=str),
        config=config,
        metadata_json={"action": "adjust_nutrition_plan"},
    )
    db.commit()
    db.refresh(conversation)

    detail = get_nutrition_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Nutrition plan not found")
    return {"conversation_id": conversation.id, "plan": detail}
```

- [ ] **Step 6: Add AI routes**

Modify `backend/app/api/routes/ai_coach.py` imports:

```python
from app.schemas.nutrition_plans import (
    AdjustNutritionPlanRequest,
    AiNutritionPlanResponse,
    GenerateNutritionPlanRequest,
)
from app.services.ai_service import (
    adjust_ai_nutrition_plan,
    generate_ai_nutrition_plan,
)
```

Add route handlers:

```python
@router.post(
    "/nutrition-plans/generate",
    response_model=AiNutritionPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_my_nutrition_plan(
    payload: GenerateNutritionPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiNutritionPlanResponse:
    try:
        return generate_ai_nutrition_plan(db, current_user.id, payload)
    except AiCoachError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/nutrition-plans/{plan_id}/adjust",
    response_model=AiNutritionPlanResponse,
)
def adjust_my_nutrition_plan(
    plan_id: int,
    payload: AdjustNutritionPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiNutritionPlanResponse:
    try:
        result = adjust_ai_nutrition_plan(db, current_user.id, plan_id, payload)
    except AiCoachError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nutrition plan not found")
    return result
```

- [ ] **Step 7: Run AI route tests**

Run:

```bash
cd backend && pytest tests/test_nutrition_plans.py::test_ai_generates_default_seven_day_nutrition_plan tests/test_nutrition_plans.py::test_ai_respects_prompt_day_count tests/test_nutrition_plans.py::test_ai_adjustment_creates_new_nutrition_plan_version -v
```

Expected: PASS.

- [ ] **Step 8: Commit AI nutrition plan flow**

```bash
git add backend/app/schemas/nutrition_plans.py backend/app/services/ai_service.py backend/app/api/routes/ai_coach.py backend/tests/test_nutrition_plans.py
git commit -m "feat: generate nutrition plans with ai"
```

---

### Task 4: Log Attribution, Summary, and Reconciliation

**Files:**
- Modify: `backend/app/services/nutrition_plan_service.py`
- Modify: `backend/app/services/nutrition_service.py`
- Create: `backend/app/services/nutrition_reconciliation_service.py`
- Modify: `backend/app/schemas/nutrition_plans.py`
- Modify: `backend/app/api/routes/nutrition.py`
- Test: `backend/tests/test_nutrition_reconciliation.py`

- [ ] **Step 1: Write failing attribution and summary tests**

Create `backend/tests/test_nutrition_reconciliation.py`:

```python
from datetime import date

from app.schemas.nutrition_plans import NutritionPlanCreate, NutritionPlanMealCreate
from app.services.nutrition_plan_service import create_nutrition_plan


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _meal(day: date, meal_type: str, calories: int):
    return NutritionPlanMealCreate(
        scheduled_date=day,
        meal_type=meal_type,
        sort_order=0,
        title=f"{meal_type} 计划",
        target_calories_kcal=calories,
    )


def test_manual_log_auto_links_to_matching_plan_meal(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-link@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="一天计划",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[_meal(date(2026, 6, 7), "lunch", 650)],
        ),
        source="ai_generated",
        user_prompt="生成一天",
    )

    response = client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-07T12:00:00",
            "meal_type": "lunch",
            "food_name": "鸡胸肉沙拉",
            "calories_kcal": 620,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["nutrition_plan_meal_id"] is not None


def test_summary_returns_today_and_seven_day_calories(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-summary@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="计划",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[
                _meal(date(2026, 6, 7), "breakfast", 450),
                _meal(date(2026, 6, 7), "lunch", 650),
            ],
        ),
        source="ai_generated",
        user_prompt="生成一天",
    )
    client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-07T08:00:00",
            "meal_type": "breakfast",
            "food_name": "燕麦",
            "calories_kcal": 420,
            "protein_g": 20,
            "carbs_g": 50,
            "fat_g": 8,
        },
    )

    response = client.get(
        "/api/nutrition/summary?today=2026-06-07&days=7",
        headers=_auth(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["today"]["actual_calories_kcal"] == 420
    assert data["today"]["target_calories_kcal"] == 1100
    assert len(data["daily"]) == 7
    assert data["daily"][-1]["date"] == "2026-06-07"


def test_reconcile_marks_missed_and_over_target(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-reconcile@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="计划",
            start_date=date(2026, 6, 6),
            end_date=date(2026, 6, 6),
            days_count=1,
            meals=[
                _meal(date(2026, 6, 6), "breakfast", 300),
                _meal(date(2026, 6, 6), "lunch", 500),
            ],
        ),
        source="ai_generated",
        user_prompt="生成一天",
    )
    client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-06T12:00:00",
            "meal_type": "lunch",
            "food_name": "大份盖饭",
            "calories_kcal": 720,
        },
    )

    response = client.post(
        "/api/nutrition/reconcile",
        headers=_auth(token),
        json={"today": "2026-06-07"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["reconciled_date"] == "2026-06-06"
    assert data["missed_meals"] == 1
    assert data["updated_meals"] == 2
```

- [ ] **Step 2: Run reconciliation tests to verify they fail**

Run:

```bash
cd backend && pytest tests/test_nutrition_reconciliation.py -v
```

Expected: FAIL because summary and reconcile endpoints do not exist and logs are not attributed.

- [ ] **Step 3: Add summary and reconcile schemas**

Append to `backend/app/schemas/nutrition_plans.py`:

```python
class NutritionDailySummary(BaseModel):
    date: date
    target_calories_kcal: int
    actual_calories_kcal: int
    actual_protein_g: float
    actual_carbs_g: float
    actual_fat_g: float
    has_logs: bool


class NutritionTodaySummary(BaseModel):
    date: date
    target_calories_kcal: int
    actual_calories_kcal: int
    actual_protein_g: float
    actual_carbs_g: float
    actual_fat_g: float
    meals: list[NutritionPlanMealResponse]


class NutritionSummaryResponse(BaseModel):
    today: NutritionTodaySummary
    daily: list[NutritionDailySummary]


class NutritionReconcileRequest(BaseModel):
    today: Optional[date] = None

    model_config = ConfigDict(extra="forbid")


class NutritionReconcileResponse(BaseModel):
    updated_meals: int
    missed_meals: int
    reconciled_date: date
```

- [ ] **Step 4: Implement attribution and aggregate helpers**

Add to `backend/app/services/nutrition_plan_service.py`:

```python
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.nutrition_log import NutritionLog
from app.models.user_profile import UserProfile
```

Add helpers:

```python
def user_timezone(db: Session, user_id: int) -> ZoneInfo:
    profile = db.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    ).scalars().first()
    timezone_name = profile.timezone if profile else "Asia/Shanghai"
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Shanghai")


def local_date_for_log(db: Session, user_id: int, log: NutritionLog) -> date:
    timezone = user_timezone(db, user_id)
    return log.logged_at.replace(tzinfo=timezone).date()


def find_matching_plan_meal(
    db: Session, user_id: int, scheduled_date: date, meal_type: str
) -> Optional[NutritionPlanMeal]:
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == scheduled_date,
            NutritionPlanMeal.meal_type == meal_type,
        )
        .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
    )
    return db.execute(statement).scalars().first()


def status_for_actual(target: Optional[int], actual: int, has_logs: bool, final: bool) -> str:
    if not has_logs:
        return "missed" if final else "planned"
    if target is None or target <= 0:
        return "logged"
    if actual < target * 0.8:
        return "partial"
    if actual > target * 1.2:
        return "over_target"
    return "logged"
```

Add aggregate functions:

```python
def recalculate_meal_actuals(
    db: Session, meal_id: int, final: bool = False
) -> Optional[NutritionPlanMeal]:
    meal = db.get(NutritionPlanMeal, meal_id)
    if meal is None:
        return None
    logs = list(
        db.execute(
            select(NutritionLog).where(NutritionLog.nutrition_plan_meal_id == meal.id)
        ).scalars()
    )
    actual_calories = sum(log.calories_kcal for log in logs)
    meal.actual_calories_kcal = actual_calories
    meal.actual_protein_g = sum(log.protein_g or 0 for log in logs)
    meal.actual_carbs_g = sum(log.carbs_g or 0 for log in logs)
    meal.actual_fat_g = sum(log.fat_g or 0 for log in logs)
    meal.status = status_for_actual(
        meal.target_calories_kcal, actual_calories, bool(logs), final
    )
    meal.last_reconciled_at = datetime.utcnow()
    return meal


def recalculate_day_actuals(
    db: Session, user_id: int, day: date, final: bool = False
) -> list[NutritionPlanMeal]:
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == day,
        )
    )
    meals = list(db.execute(statement).scalars())
    for meal in meals:
        recalculate_meal_actuals(db, meal.id, final=final)
    return meals


def attribute_log_to_plan_meal(
    db: Session, user_id: int, log: NutritionLog
) -> NutritionLog:
    scheduled_date = local_date_for_log(db, user_id, log)
    meal = find_matching_plan_meal(db, user_id, scheduled_date, log.meal_type)
    log.nutrition_plan_meal_id = meal.id if meal is not None else None
    return log


def get_nutrition_summary(
    db: Session, user_id: int, today: Optional[date] = None, days: int = 7
) -> dict[str, object]:
    effective_days = max(1, min(days, 14))
    timezone = user_timezone(db, user_id)
    effective_today = today or datetime.now(timezone).date()
    start_date = effective_today - timedelta(days=effective_days - 1)
    active_plan = (
        db.execute(
            select(NutritionPlan)
            .where(
                NutritionPlan.user_id == user_id,
                NutritionPlan.is_active.is_(True),
            )
            .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
        )
        .scalars()
        .first()
    )
    meals = []
    if active_plan is not None:
        meals = list(
            db.execute(
                select(NutritionPlanMeal)
                .where(
                    NutritionPlanMeal.nutrition_plan_id == active_plan.id,
                    NutritionPlanMeal.version_number == active_plan.current_version,
                    NutritionPlanMeal.scheduled_date == effective_today,
                )
                .order_by(NutritionPlanMeal.sort_order, NutritionPlanMeal.id)
            ).scalars()
        )

    logs = list(
        db.execute(
            select(NutritionLog).where(
                NutritionLog.user_id == user_id,
                NutritionLog.logged_at >= datetime.combine(start_date, datetime.min.time()),
                NutritionLog.logged_at <= datetime.combine(effective_today, datetime.max.time()),
            )
        ).scalars()
    )
    daily = []
    for offset in range(effective_days):
        day = start_date + timedelta(days=offset)
        day_logs = [log for log in logs if log.logged_at.date() == day]
        day_meals = []
        if active_plan is not None:
            day_meals = list(
                db.execute(
                    select(NutritionPlanMeal).where(
                        NutritionPlanMeal.nutrition_plan_id == active_plan.id,
                        NutritionPlanMeal.version_number == active_plan.current_version,
                        NutritionPlanMeal.scheduled_date == day,
                    )
                ).scalars()
            )
        daily.append(
            {
                "date": day,
                "target_calories_kcal": sum(
                    meal.target_calories_kcal or 0 for meal in day_meals
                ),
                "actual_calories_kcal": sum(log.calories_kcal for log in day_logs),
                "actual_protein_g": sum(log.protein_g or 0 for log in day_logs),
                "actual_carbs_g": sum(log.carbs_g or 0 for log in day_logs),
                "actual_fat_g": sum(log.fat_g or 0 for log in day_logs),
                "has_logs": bool(day_logs),
            }
        )
    today_row = daily[-1]
    return {
        "today": {
            "date": effective_today,
            "target_calories_kcal": today_row["target_calories_kcal"],
            "actual_calories_kcal": today_row["actual_calories_kcal"],
            "actual_protein_g": today_row["actual_protein_g"],
            "actual_carbs_g": today_row["actual_carbs_g"],
            "actual_fat_g": today_row["actual_fat_g"],
            "meals": meals,
        },
        "daily": daily,
    }
```

- [ ] **Step 5: Wire attribution into nutrition_service**

Modify `backend/app/services/nutrition_service.py` imports:

```python
from app.services.nutrition_plan_service import (
    attribute_log_to_plan_meal,
    recalculate_day_actuals,
)
```

After creating a log in `create_nutrition_log`, before `db.commit()`, flush and attribute:

```python
db.add(log)
db.flush()
attribute_log_to_plan_meal(db, user_id, log)
db.commit()
db.refresh(log)
recalculate_day_actuals(db, user_id, log.logged_at.date(), final=False)
db.refresh(log)
return log
```

In `apply_nutrition_correction`, after applying updates and before commit:

```python
old_meal_id = log.nutrition_plan_meal_id
attribute_log_to_plan_meal(db, log.user_id, log)
if old_meal_id is not None and old_meal_id != log.nutrition_plan_meal_id:
    recalculate_meal_actuals(db, old_meal_id, final=False)
recalculate_day_actuals(db, log.user_id, log.logged_at.date(), final=False)
```

- [ ] **Step 6: Add reconciliation service**

Create `backend/app/services/nutrition_reconciliation_service.py`:

```python
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.services.nutrition_plan_service import (
    recalculate_meal_actuals,
    user_timezone,
)


def reconcile_nutrition_calendar(
    db: Session, user_id: int, today: Optional[date] = None
) -> dict[str, object]:
    timezone = user_timezone(db, user_id)
    effective_today = today or datetime.now(timezone).date()
    reconciled_date = effective_today - timedelta(days=1)
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == reconciled_date,
        )
    )
    updated = 0
    missed = 0
    for meal in db.execute(statement).scalars():
        recalculate_meal_actuals(db, meal.id, final=True)
        updated += 1
        if meal.status == "missed":
            missed += 1
    db.commit()
    return {
        "updated_meals": updated,
        "missed_meals": missed,
        "reconciled_date": reconciled_date,
    }
```

- [ ] **Step 7: Add nutrition routes**

Modify `backend/app/api/routes/nutrition.py` imports from `app.schemas.nutrition_plans` and services. Add endpoints:

```python
@router.get("/plans", response_model=list[NutritionPlanSummaryResponse])
def list_my_nutrition_plans(...):
    return list_nutrition_plans(db, current_user.id)

@router.get("/plans/{plan_id}", response_model=NutritionPlanDetailResponse)
def get_my_nutrition_plan(...):
    detail = get_nutrition_plan_detail(db, current_user.id, plan_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    return detail

@router.put("/plans/{plan_id}/meals", response_model=NutritionPlanDetailResponse)
def replace_my_nutrition_plan_meals(...):
    plan = replace_nutrition_plan_meals(db, current_user.id, plan_id, payload)
    if plan is None:
        raise HTTPException(status_code=404, detail="Nutrition plan not found")
    return get_nutrition_plan_detail(db, current_user.id, plan.id)

@router.get("/summary", response_model=NutritionSummaryResponse)
def get_my_nutrition_summary(days: int = 7, today: Optional[date] = None, ...):
    return get_nutrition_summary(db, current_user.id, today=today, days=days)

@router.post("/reconcile", response_model=NutritionReconcileResponse)
def reconcile_my_nutrition(payload: NutritionReconcileRequest, ...):
    return reconcile_nutrition_calendar(db, current_user.id, today=payload.today)
```

- [ ] **Step 8: Run reconciliation tests**

Run:

```bash
cd backend && pytest tests/test_nutrition_reconciliation.py -v
```

Expected: PASS.

- [ ] **Step 9: Commit attribution and summary**

```bash
git add backend/app/services/nutrition_plan_service.py backend/app/services/nutrition_service.py backend/app/services/nutrition_reconciliation_service.py backend/app/schemas/nutrition_plans.py backend/app/api/routes/nutrition.py backend/tests/test_nutrition_reconciliation.py
git commit -m "feat: reconcile nutrition intake"
```

---

### Task 5: Frontend API Client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add TypeScript types**

In `frontend/src/api/client.ts`, add:

```ts
export type NutritionPlanMeal = {
  id: number;
  nutrition_plan_id: number;
  version_number: number;
  scheduled_date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  sort_order: number;
  title: string;
  food_items: Array<Record<string, unknown>>;
  portion_notes: string | null;
  target_calories_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  notes: string | null;
  status: "planned" | "logged" | "partial" | "over_target" | "missed";
  actual_calories_kcal: number;
  actual_protein_g: number | null;
  actual_carbs_g: number | null;
  actual_fat_g: number | null;
  last_reconciled_at: string | null;
};

export type NutritionPlan = {
  id: number;
  user_id: number;
  title: string;
  source: string;
  current_version: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  days_count: number;
  created_at: string;
  updated_at: string;
};

export type NutritionPlanDetail = NutritionPlan & {
  items: NutritionPlanMeal[];
  versions: Array<{
    id: number;
    nutrition_plan_id: number;
    version_number: number;
    source: string;
    user_prompt: string | null;
    change_summary: string | null;
    created_at: string;
  }>;
};

export type NutritionSummary = {
  today: {
    date: string;
    target_calories_kcal: number;
    actual_calories_kcal: number;
    actual_protein_g: number;
    actual_carbs_g: number;
    actual_fat_g: number;
    meals: NutritionPlanMeal[];
  };
  daily: Array<{
    date: string;
    target_calories_kcal: number;
    actual_calories_kcal: number;
    actual_protein_g: number;
    actual_carbs_g: number;
    actual_fat_g: number;
    has_logs: boolean;
  }>;
};
```

Also add `nutrition_plan_meal_id: number | null;` to `NutritionLog`.

- [ ] **Step 2: Add API helpers**

Add:

```ts
export function fetchNutritionSummary(days = 7) {
  return apiRequest<NutritionSummary>(`/nutrition/summary?days=${days}`);
}

export function fetchNutritionPlans() {
  return apiRequest<NutritionPlan[]>("/nutrition/plans");
}

export function fetchNutritionPlan(planId: number) {
  return apiRequest<NutritionPlanDetail>(`/nutrition/plans/${planId}`);
}

export function generateNutritionPlan(prompt: string) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    "/ai-coach/nutrition-plans/generate",
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    },
  );
}

export function adjustNutritionPlan(planId: number, prompt: string) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    `/ai-coach/nutrition-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ prompt }),
    },
  );
}
```

- [ ] **Step 3: Build frontend to catch type errors**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit frontend API client**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add nutrition plan client api"
```

---

### Task 6: Frontend Nutrition Page Refactor

**Files:**
- Modify: `frontend/src/pages/user/NutritionPage.tsx`

- [ ] **Step 1: Replace local derived today calories with summary loading**

Update imports:

```ts
import {
  NutritionPlanDetail,
  NutritionSummary,
  adjustNutritionPlan,
  createNutritionLog,
  fetchHeartRateSummary,
  fetchNutritionLogs,
  fetchNutritionSummary,
  generateNutritionPlan,
  importHeartRateSamples,
  recognizeFood,
  updateNutritionLogCorrection,
} from "../../api/client";
```

Add state:

```ts
const [summary, setSummary] = useState<NutritionSummary | null>(null);
const [activePlan, setActivePlan] = useState<NutritionPlanDetail | null>(null);
const [planPrompt, setPlanPrompt] = useState("默认生成 7 天，高蛋白，少油");
const [adjustPrompt, setAdjustPrompt] = useState("");
```

Change `loadData` to include:

```ts
const [nextLogs, nextHeartSummary, nextSummary] = await Promise.all([
  fetchNutritionLogs(),
  fetchHeartRateSummary(),
  fetchNutritionSummary(7),
]);
setLogs(nextLogs);
setHeartSummary(nextHeartSummary);
setSummary(nextSummary);
```

Remove the old `todayCalories` `useMemo`; use `summary?.today.actual_calories_kcal ?? 0`.

- [ ] **Step 2: Add plan generation and adjustment handlers**

Add:

```ts
async function handlePlanGenerate(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!planPrompt.trim()) {
    setError("请输入饮食计划需求");
    return;
  }
  setIsSaving(true);
  setError(null);
  setStatus(null);
  try {
    const response = await generateNutritionPlan(planPrompt.trim());
    setActivePlan(response.plan);
    setStatus("饮食计划已生成");
    await loadData();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "饮食计划生成失败");
  } finally {
    setIsSaving(false);
  }
}

async function handlePlanAdjust(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!activePlan || !adjustPrompt.trim()) {
    setError("需要先生成计划并输入调整需求");
    return;
  }
  setIsSaving(true);
  setError(null);
  setStatus(null);
  try {
    const response = await adjustNutritionPlan(activePlan.id, adjustPrompt.trim());
    setActivePlan(response.plan);
    setAdjustPrompt("");
    setStatus("饮食计划已调整");
    await loadData();
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "饮食计划调整失败");
  } finally {
    setIsSaving(false);
  }
}
```

- [ ] **Step 3: Add a lightweight 7-day calorie chart**

Add helper:

```ts
function renderCalorieChart(summary: NutritionSummary | null) {
  const days = summary?.daily ?? [];
  const maxValue = Math.max(
    1,
    ...days.map((day) =>
      Math.max(day.actual_calories_kcal, day.target_calories_kcal),
    ),
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <h3 className="text-base font-semibold text-slate-950">近 7 天卡路里</h3>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const actualHeight = Math.max(6, (day.actual_calories_kcal / maxValue) * 120);
          const targetHeight = Math.max(6, (day.target_calories_kcal / maxValue) * 120);
          return (
            <div key={day.date} className="flex min-w-0 flex-col items-center gap-2">
              <div className="flex h-32 items-end gap-1">
                <span
                  className="w-3 rounded-t bg-gym-teal"
                  style={{ height: `${actualHeight}px` }}
                  title={`实际 ${day.actual_calories_kcal} 千卡`}
                />
                <span
                  className="w-3 rounded-t bg-slate-300"
                  style={{ height: `${targetHeight}px` }}
                  title={`目标 ${day.target_calories_kcal} 千卡`}
                />
              </div>
              <span className="truncate text-xs text-slate-500">
                {new Date(day.date).getDate()}日
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render today-first layout**

Replace the top summary grid with:

```tsx
<div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
  <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-slate-600">今日摄入</p>
        <p className="mt-2 text-3xl font-semibold text-slate-950">
          {summary?.today.actual_calories_kcal ?? 0}
          <span className="ml-2 text-base font-medium text-slate-500">
            / {summary?.today.target_calories_kcal ?? 0} 千卡
          </span>
        </p>
      </div>
      <Utensils aria-hidden="true" className="text-gym-teal" size={24} />
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <p className="text-sm text-slate-600">蛋白 {Math.round(summary?.today.actual_protein_g ?? 0)}g</p>
      <p className="text-sm text-slate-600">碳水 {Math.round(summary?.today.actual_carbs_g ?? 0)}g</p>
      <p className="text-sm text-slate-600">脂肪 {Math.round(summary?.today.actual_fat_g ?? 0)}g</p>
    </div>
  </article>
  {renderCalorieChart(summary)}
</div>
```

Add today meal cards before tabs:

```tsx
<div className="grid gap-3 md:grid-cols-2">
  {(summary?.today.meals ?? []).map((meal) => (
    <article key={meal.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{mealLabels[meal.meal_type]}</p>
          <p className="mt-1 text-sm text-slate-600">{meal.title}</p>
        </div>
        <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-semibold text-gym-teal">
          {meal.status}
        </span>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {meal.actual_calories_kcal} / {meal.target_calories_kcal ?? 0} 千卡
      </p>
      {meal.portion_notes ? (
        <p className="mt-2 text-sm text-slate-500">{meal.portion_notes}</p>
      ) : null}
    </article>
  ))}
</div>
```

- [ ] **Step 5: Add plan tab UI**

Add `"plan"` to `NutritionTab`, add a tab label `计划`, and render:

```tsx
{activeTab === "plan" ? (
  <div className="space-y-3">
    <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={handlePlanGenerate}>
      <h3 className="text-lg font-semibold text-slate-950">生成饮食计划</h3>
      <textarea
        className="mt-4 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
        value={planPrompt}
        onChange={(event) => setPlanPrompt(event.target.value)}
      />
      <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">
        <Sparkles aria-hidden="true" size={17} />
        生成计划
      </button>
    </form>
    {activePlan ? (
      <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft" onSubmit={handlePlanAdjust}>
        <h3 className="text-lg font-semibold text-slate-950">调整当前计划</h3>
        <textarea
          className="mt-4 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
          value={adjustPrompt}
          onChange={(event) => setAdjustPrompt(event.target.value)}
        />
        <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">
          <Sparkles aria-hidden="true" size={17} />
          调整计划
        </button>
      </form>
    ) : null}
  </div>
) : null}
```

- [ ] **Step 6: Build frontend**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit nutrition page refactor**

```bash
git add frontend/src/pages/user/NutritionPage.tsx
git commit -m "feat: show nutrition plan dashboard"
```

---

### Task 7: Backend and Frontend Regression

**Files:**
- No new source files.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd backend && pytest tests/test_nutrition_plan_models.py tests/test_nutrition_plans.py tests/test_nutrition_reconciliation.py tests/test_nutrition.py -v
```

Expected: PASS.

- [ ] **Step 2: Run full backend test suite**

Run:

```bash
cd backend && pytest
```

Expected: PASS.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
cd frontend && npm test
```

Expected: PASS. If the repo reports no tests to run, capture that exact output in the implementation notes.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit any regression fixes**

If Tasks 7.1 through 7.4 required source changes, commit them:

```bash
git add backend frontend
git commit -m "fix: stabilize nutrition plan refactor"
```

If no source changes were needed, do not create an empty commit.

---

## Manual Verification

After implementation, run the app and verify:

- A user without AI Provider sees a clear error for generate/adjust but can still manually log food.
- With `SMART_GYM_AI_FAKE_RESPONSES=true`, generating “生成 3 天，早餐不要牛奶” creates 12 meal cards.
- A lunch log on a planned day links to the lunch plan meal and updates today calories immediately.
- `/api/nutrition/summary?days=7` returns seven daily points.
- Reconcile with `today=2026-06-07` marks unlogged meals on `2026-06-06` as `missed`.
- The nutrition page shows today intake, meal cards, 7-day chart, recognition, manual entry, records, and plan generation without overlapping text on desktop and mobile widths.
