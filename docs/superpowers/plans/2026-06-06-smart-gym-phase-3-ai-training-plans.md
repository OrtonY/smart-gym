# 智慧健身房第 3 期 AI 教练与训练课表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现第 3 期 AI 教练训练课表闭环，包括版本化训练课表、AI 对话记录、基于当前用户 AI Provider 配置的课表生成和对话式调整。

**Architecture:** 后端继续沿用 FastAPI 单体分层结构，新增 `training_plans`、`training_plan_versions`、`training_plan_items`、`ai_conversations` 和 `ai_messages` 私有数据模型。AI 调用通过 `AIService` 读取当前用户启用的 `ai_provider_configs`，Provider 失败时返回明确错误但保留手动创建和编辑课表能力。前端在用户端新增 `/app/plans` 页面，提供生成、查看、编辑和版本切换入口。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy 2.x、Alembic、PostgreSQL、pytest、httpx、React、Vite、TypeScript、Tailwind CSS、React Router、lucide-react。

---

## 范围说明

本计划只实现规格中的第 3 期：

- AI 生成训练课表。
- 训练课表可编辑。
- 训练课表版本化保存。
- 通过对话要求 AI 调整训练课表。
- 保存 AI 对话和消息。
- AI 调用必须按当前登录用户读取其自己的 AI Provider 配置。

本计划不实现 AI 食谱、食物图片识别、动作检测、动作检测 AI 分析和手环导入；这些进入后续阶段。

对应规格文档：

- `docs/superpowers/specs/2026-06-05-smart-gym-design.md`
- `docs/superpowers/plans/2026-06-05-smart-gym-phase-1-platform.md`
- `docs/superpowers/plans/2026-06-06-smart-gym-phase-2-training-leaderboard.md`

## 目标文件结构

```text
backend/
  app/
    api/
      router.py
      routes/
        ai_coach.py
        training_plans.py
    models/
      __init__.py
      ai_conversation.py
      ai_message.py
      training_plan.py
      training_plan_item.py
      training_plan_version.py
    schemas/
      ai_coach.py
      training_plans.py
    services/
      ai_service.py
      training_plan_service.py
    migrations/
      versions/
        20260606_phase3_ai_training_plans.py
  tests/
    conftest.py
    test_phase3_models.py
    test_training_plans.py
    test_ai_coach_training_plans.py
frontend/
  src/
    api/client.ts
    components/Layout.tsx
    pages/user/TrainingPlansPage.tsx
    routes/UserRoutes.tsx
```

## Data Contracts

`TrainingPlan`:

- `id: int`
- `user_id: int`
- `title: str`
- `source: str`, values: `manual`, `ai`
- `current_version: int`
- `is_active: bool`
- `created_at: datetime`
- `updated_at: datetime`

`TrainingPlanVersion`:

- `id: int`
- `training_plan_id: int`
- `version_number: int`
- `source: str`, values: `manual`, `ai`
- `change_summary: str | None`
- `created_at: datetime`

`TrainingPlanItem`:

- `id: int`
- `training_plan_id: int`
- `version_number: int`
- `day_of_week: int`, values: `1` to `7`
- `sort_order: int`
- `exercise_id: int | None`
- `workout_mode_id: int | None`
- `title: str`
- `sets: int | None`
- `reps: int | None`
- `duration_minutes: int | None`
- `notes: str | None`

`AiConversation`:

- `id: int`
- `user_id: int`
- `topic: str`, values used in this plan: `training_plan`
- `training_plan_id: int | None`
- `created_at: datetime`
- `updated_at: datetime`

`AiMessage`:

- `id: int`
- `conversation_id: int`
- `role: str`, values: `user`, `assistant`, `system`
- `content: str`
- `provider_type: str | None`
- `model_name: str | None`
- `metadata_json: dict | None`
- `created_at: datetime`

## Task 1: 后端第 3 期数据模型

**Files:**
- Create: `backend/app/models/training_plan.py`
- Create: `backend/app/models/training_plan_version.py`
- Create: `backend/app/models/training_plan_item.py`
- Create: `backend/app/models/ai_conversation.py`
- Create: `backend/app/models/ai_message.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_phase3_models.py`
- Create: `backend/app/migrations/versions/20260606_phase3_ai_training_plans.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_phase3_models.py`:

```python
from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion


def test_phase3_models_have_required_columns():
    assert "user_id" in TrainingPlan.__table__.columns
    assert "current_version" in TrainingPlan.__table__.columns
    assert "training_plan_id" in TrainingPlanVersion.__table__.columns
    assert "version_number" in TrainingPlanVersion.__table__.columns
    assert "day_of_week" in TrainingPlanItem.__table__.columns
    assert "exercise_id" in TrainingPlanItem.__table__.columns
    assert "user_id" in AiConversation.__table__.columns
    assert "training_plan_id" in AiConversation.__table__.columns
    assert "conversation_id" in AiMessage.__table__.columns
    assert "provider_type" in AiMessage.__table__.columns
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
python -m pytest tests/test_phase3_models.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.ai_conversation'`.

- [ ] **Step 3: Add model files**

Create the five model files exactly as described in this task's file list. Each private root table must include `user_id`; child tables must reference their parent table with `ondelete="CASCADE"`.

- [ ] **Step 4: Register models in tests**

Update `backend/tests/conftest.py` to import all five phase 3 models and include them in `_models`, so SQLite test metadata creates the tables.

- [ ] **Step 5: Add Alembic migration**

Create `backend/app/migrations/versions/20260606_phase3_ai_training_plans.py` with the same tables, indexes, foreign keys and uniqueness constraints used by the SQLAlchemy models.

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
cd backend
python -m pytest tests/test_phase3_models.py -v
```

Expected: PASS.

## Task 2: 训练课表 schema 与 service

**Files:**
- Create: `backend/app/schemas/training_plans.py`
- Create: `backend/app/services/training_plan_service.py`
- Create: `backend/tests/test_training_plans.py`

- [ ] **Step 1: Write tests**

Create tests that verify:

- user A cannot list user B's plans;
- creating a manual plan creates version `1`;
- editing a plan creates the next version and moves `current_version`;
- listing current plan items only returns items for the current version.

- [ ] **Step 2: Implement Pydantic schemas**

Create request and response schemas for plan creation, plan update, item creation, item update, version response and plan detail response. Use `ConfigDict(from_attributes=True)` for response models.

- [ ] **Step 3: Implement service functions**

Implement:

- `create_training_plan(db, user_id, payload)`
- `list_training_plans(db, user_id)`
- `get_training_plan_detail(db, user_id, plan_id)`
- `replace_training_plan_items(db, user_id, plan_id, payload, source, change_summary)`
- `list_training_plan_versions(db, user_id, plan_id)`

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend
python -m pytest tests/test_training_plans.py -v
```

Expected: PASS.

## Task 3: 训练课表 API

**Files:**
- Create: `backend/app/api/routes/training_plans.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_training_plan_routes.py`

- [ ] **Step 1: Write route tests**

Create tests for:

- `POST /api/training-plans`
- `GET /api/training-plans`
- `GET /api/training-plans/{plan_id}`
- `PUT /api/training-plans/{plan_id}/items`
- `GET /api/training-plans/{plan_id}/versions`
- cross-user access returns 404.

- [ ] **Step 2: Implement routes**

Wire the service functions through authenticated routes using `get_current_user`.

- [ ] **Step 3: Register router**

Add `training_plans` to `backend/app/api/router.py` with prefix `/training-plans`.

- [ ] **Step 4: Run tests**

Run:

```bash
cd backend
python -m pytest tests/test_training_plan_routes.py -v
```

Expected: PASS.

## Task 4: AI service and AI coach routes

**Files:**
- Create: `backend/app/services/ai_service.py`
- Create: `backend/app/schemas/ai_coach.py`
- Create: `backend/app/api/routes/ai_coach.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_ai_coach_training_plans.py`

- [ ] **Step 1: Write tests**

Create tests that verify:

- no active AI Provider config returns 400 and does not create a plan;
- the active AI Provider config must belong to the current user;
- generated plan creates a plan, version, items, conversation and assistant message;
- adjust request appends user and assistant messages and creates a new plan version.

- [ ] **Step 2: Implement provider config selection**

In `AIService`, select the current user's first active `AiProviderConfig`. Do not read configs from other users.

- [ ] **Step 3: Implement deterministic local generation fallback for tests**

When `SMART_GYM_AI_FAKE_RESPONSES=true`, return a deterministic structured plan without network calls. Keep this behind settings so production still requires a provider.

- [ ] **Step 4: Implement AI coach routes**

Add:

- `POST /api/ai-coach/training-plans/generate`
- `POST /api/ai-coach/training-plans/{plan_id}/adjust`

- [ ] **Step 5: Run tests**

Run:

```bash
cd backend
python -m pytest tests/test_ai_coach_training_plans.py -v
```

Expected: PASS.

## Task 5: 前端训练课表页面

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/user/TrainingPlansPage.tsx`
- Modify: `frontend/src/routes/UserRoutes.tsx`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add API client types and functions**

Add TypeScript types for training plans, versions, items, generate request and adjust request. Add functions for all phase 3 endpoints.

- [ ] **Step 2: Build `/app/plans` page**

Create a mobile-first page with:

- list of plans;
- active plan detail;
- generate button;
- editable current-version items;
- version list;
- adjustment prompt field.

- [ ] **Step 3: Add route and navigation**

Register `/app/plans` and add a bottom-nav item with a lucide icon.

- [ ] **Step 4: Run frontend checks**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

## Verification

Run all backend and frontend checks:

```bash
cd backend
python -m pytest -v
cd ../frontend
npm run build
```

Expected: all tests pass and the frontend production build succeeds.

