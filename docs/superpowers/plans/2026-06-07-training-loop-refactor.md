# Training Loop Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Keep-inspired training loop where the user opens the app, sees today’s training, starts a guided workout, records actual results, and sees the plan calendar update as the source of training truth.

**Architecture:** Add a first-class workout template content source, keep existing training plans as editable user-owned copies, and introduce a session lifecycle that snapshots planned steps at start and writes step results at finish. A new today-training aggregation service selects planned work first and template recommendations second, while a reconciliation service updates plan calendar state daily based on actual sessions.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.x, Alembic, pytest, React 18, Vite, TypeScript, Tailwind CSS, Vitest, MediaPipe Tasks Vision, lucide-react.

---

## Scope Check

This is one product subsystem: the user training loop. It touches backend content, plans, sessions, reconciliation, and the user/admin frontend, but all changes serve one testable workflow: template or plan -> guided session -> actual record -> plan calendar status. Nutrition, leaderboard scoring rules, AI provider plumbing, and full training camp/course products stay out of scope.

## Target File Structure

```text
backend/app/models/workout_template.py            # New template metadata model
backend/app/models/workout_template_step.py       # New template step model
backend/app/models/workout_session_step.py        # New session step result model
backend/app/models/training_plan_item.py          # Extend plan item fields and status
backend/app/models/workout_session.py             # Extend source and step summary fields
backend/app/models/user_profile.py                # Add timezone for local-day reconciliation
backend/app/models/__init__.py                    # Import new models for metadata/tests
backend/app/migrations/versions/20260607_training_loop_refactor.py

backend/app/schemas/workout_templates.py          # User/admin template schemas
backend/app/schemas/today.py                      # TodayWorkout response schemas
backend/app/schemas/workouts.py                   # Start/finish/session-step schemas
backend/app/schemas/training_plans.py             # Plan item extensions and reconciliation response
backend/app/schemas/users.py                      # UserProfile timezone schema field

backend/app/services/workout_template_service.py  # Template CRUD, filtering, apply-to-plan
backend/app/services/today_training_service.py    # Plan-first/template-fallback aggregator
backend/app/services/workout_session_service.py   # Start/finish lifecycle and step snapshots
backend/app/services/training_reconciliation_service.py # Local-day plan status reconciliation
backend/app/services/training_plan_service.py     # Plan item extension and ad-hoc entries
backend/app/services/content_seed.py              # Seed 6-8 published workout templates

backend/app/api/routes/workout_templates.py       # User template list/detail/apply endpoints
backend/app/api/routes/today.py                   # GET /api/today/training
backend/app/api/routes/workouts.py                # Add start/finish endpoints, keep legacy create
backend/app/api/routes/training_plans.py          # Add reconcile endpoint
backend/app/api/routes/admin_content.py           # Admin template CRUD endpoints
backend/app/api/router.py                         # Register today and template routers

backend/tests/test_training_loop_models.py
backend/tests/test_workout_templates.py
backend/tests/test_today_training.py
backend/tests/test_workout_session_lifecycle.py
backend/tests/test_training_reconciliation.py

frontend/src/api/client.ts                         # Add types and API helpers
frontend/src/routes/UserRoutes.tsx                 # Add overview/player/review routes
frontend/src/routes/AdminRoutes.tsx                # Add admin template route
frontend/src/components/Layout.tsx                 # Reduce bottom nav and admin template nav
frontend/src/components/PoseDetectionPanel.tsx     # Extract reusable detection panel from pose page
frontend/src/pages/user/HomePage.tsx               # Today training action center
frontend/src/pages/user/TrainingPage.tsx           # Template library, quick start, history
frontend/src/pages/user/TrainingOverviewPage.tsx   # Start confirmation and pose opt-in
frontend/src/pages/user/GuidedWorkoutPage.tsx      # Step-by-step guided player
frontend/src/pages/user/WorkoutReviewPage.tsx      # Session result summary
frontend/src/pages/user/TrainingPlansPage.tsx      # Calendar status and record summary
frontend/src/pages/user/PoseDetectionPage.tsx      # Reuse extracted pose panel
frontend/src/pages/admin/AdminWorkoutTemplatesPage.tsx

frontend/src/training/trainingFlow.test.ts         # Pure helpers for player/review calculations
frontend/src/training/trainingFlow.ts              # Step status/duration/summary helpers
```

## Implementation Tasks

### Task 1: Backend Models, Migration, and Timezone Field

**Files:**
- Create: `backend/app/models/workout_template.py`
- Create: `backend/app/models/workout_template_step.py`
- Create: `backend/app/models/workout_session_step.py`
- Create: `backend/app/migrations/versions/20260607_training_loop_refactor.py`
- Modify: `backend/app/models/training_plan_item.py`
- Modify: `backend/app/models/workout_session.py`
- Modify: `backend/app/models/user_profile.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_training_loop_models.py`

- [ ] **Step 1: Write failing model tests**

Add tests that prove the new tables can store template steps, session step snapshots, extended plan item status, and default timezone.

```python
from datetime import date, datetime

from app.models.training_plan_item import TrainingPlanItem
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.models.workout_session_step import WorkoutSessionStep
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep


def test_workout_template_and_step_model(db_session):
    template = WorkoutTemplate(
        slug="lower-body-start",
        title="入门下肢激活",
        goal="strength",
        difficulty="beginner",
        target_muscles="臀腿、核心",
        estimated_duration_minutes=18,
        tags=["lower", "beginner"],
        recommendation_weight=10,
        is_published=True,
    )
    db_session.add(template)
    db_session.flush()
    db_session.add(
        WorkoutTemplateStep(
            workout_template_id=template.id,
            sort_order=0,
            title="徒手深蹲",
            sets=3,
            reps=12,
            duration_seconds=None,
            rest_seconds=45,
            instruction="保持膝盖朝脚尖方向",
            allow_pose_detection=True,
        )
    )
    db_session.commit()

    stored = db_session.query(WorkoutTemplate).filter_by(slug="lower-body-start").one()
    assert stored.tags == ["lower", "beginner"]
    assert db_session.query(WorkoutTemplateStep).count() == 1


def test_plan_item_session_extensions_and_timezone(db_session, create_user_and_token):
    user, _ = create_user_and_token("loop-model@example.com")
    profile = UserProfile(user_id=user.id)
    session = WorkoutSession(
        user_id=user.id,
        started_at=datetime(2026, 6, 7, 9, 0, 0),
        duration_minutes=20,
        calories_burned=120,
        status="completed",
        source_type="plan",
        pose_detection_enabled=True,
        completed_steps_count=1,
        total_steps_count=1,
    )
    db_session.add_all([profile, session])
    db_session.flush()
    item = TrainingPlanItem(
        training_plan_id=1,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        day_of_week=7,
        title="核心训练",
        sort_order=0,
        entry_type="scheduled",
        status="completed",
        linked_workout_session_id=session.id,
        actual_duration_seconds=1200,
        actual_score=88,
    )
    step = WorkoutSessionStep(
        workout_session_id=session.id,
        sort_order=0,
        title="核心训练",
        planned_duration_seconds=1200,
        actual_duration_seconds=1180,
        status="completed",
        score=88,
    )
    db_session.add_all([item, step])
    db_session.commit()

    assert profile.timezone == "Asia/Shanghai"
    assert item.status == "completed"
    assert step.score == 88
```

- [ ] **Step 2: Run model tests and verify they fail**

Run: `cd backend && pytest tests/test_training_loop_models.py -v`

Expected: FAIL with import errors for `WorkoutTemplate`, `WorkoutTemplateStep`, and `WorkoutSessionStep`, or missing columns on existing models.

- [ ] **Step 3: Implement models and imports**

Create focused SQLAlchemy models using existing style: `Mapped`, `mapped_column`, `datetime.utcnow`, JSON for `tags`, string status fields with service-level validation. Extend existing models with nullable/defaulted columns so old rows remain valid.

Required model defaults:
- `WorkoutTemplate.tags`: `JSON`, default `list`
- `WorkoutTemplate.recommendation_weight`: integer default `0`
- `WorkoutTemplate.is_published`: boolean default `False`
- `WorkoutTemplateStep.allow_pose_detection`: boolean default `True`
- `TrainingPlanItem.entry_type`: string default `scheduled`
- `TrainingPlanItem.status`: string default `planned`
- `UserProfile.timezone`: string default `Asia/Shanghai`
- `WorkoutSession.source_type`: string default `free`
- `WorkoutSession.pose_detection_enabled`: boolean default `False`
- `WorkoutSession.completed_steps_count` and `total_steps_count`: integer default `0`

- [ ] **Step 4: Create Alembic migration**

Create `backend/app/migrations/versions/20260607_training_loop_refactor.py` with `down_revision = "20260607_phase5_nutrition"`. Add new tables and nullable/defaulted columns to existing tables. Include indexes on user/source/date/status fields used by services.

- [ ] **Step 5: Run model tests and migration smoke check**

Run: `cd backend && pytest tests/test_training_loop_models.py -v`

Expected: PASS.

Run: `cd backend && alembic upgrade head`

Expected: migration applies against the configured local database.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models backend/app/migrations/versions/20260607_training_loop_refactor.py backend/tests/conftest.py backend/tests/test_training_loop_models.py
git commit -m "feat: add training loop data models"
```

### Task 2: Workout Template Schemas, Services, Routes, and Seed Data

**Files:**
- Create: `backend/app/schemas/workout_templates.py`
- Create: `backend/app/services/workout_template_service.py`
- Create: `backend/app/api/routes/workout_templates.py`
- Modify: `backend/app/api/routes/admin_content.py`
- Modify: `backend/app/api/router.py`
- Modify: `backend/app/services/content_seed.py`
- Test: `backend/tests/test_workout_templates.py`

- [ ] **Step 1: Write failing template API tests**

Cover public visibility, admin CRUD, filtering, seed presence, and cross-role access.

```python
def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_user_lists_only_published_templates(client, create_user_and_token):
    _, user_token = create_user_and_token("template-user@example.com")
    _, admin_token = create_user_and_token("template-admin@example.com", role="admin")
    draft = {"slug": "draft-template", "title": "草稿", "goal": "strength", "difficulty": "beginner", "target_muscles": "全身", "estimated_duration_minutes": 10, "tags": ["draft"], "is_published": False, "steps": []}
    published = {**draft, "slug": "published-template", "title": "已发布", "is_published": True}
    client.post("/api/admin/workout-templates", headers=_auth(admin_token), json=draft)
    client.post("/api/admin/workout-templates", headers=_auth(admin_token), json=published)

    response = client.get("/api/workout-templates", headers=_auth(user_token))

    assert response.status_code == 200
    assert [item["slug"] for item in response.json()] == ["published-template"]


def test_admin_creates_template_with_steps(client, create_user_and_token):
    _, admin_token = create_user_and_token("template-admin-create@example.com", role="admin")
    response = client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json={
            "slug": "lower-body-start",
            "title": "入门下肢激活",
            "description": "18 分钟臀腿基础训练",
            "goal": "strength",
            "difficulty": "beginner",
            "target_muscles": "臀腿、核心",
            "estimated_duration_minutes": 18,
            "tags": ["lower", "beginner"],
            "recommendation_weight": 10,
            "is_published": True,
            "steps": [{"sort_order": 0, "title": "徒手深蹲", "sets": 3, "reps": 12, "rest_seconds": 45, "instruction": "保持膝盖稳定", "allow_pose_detection": True}],
        },
    )

    assert response.status_code == 201
    assert response.json()["steps"][0]["title"] == "徒手深蹲"
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && pytest tests/test_workout_templates.py -v`

Expected: FAIL with missing route/schema/service errors.

- [ ] **Step 3: Implement schemas**

Add create/update/detail/list schemas. Use `extra="forbid"` on create/update payloads. Validate difficulty with `^(beginner|intermediate|advanced)$`. Validate step payloads allow either `exercise_id`, `workout_mode_id`, or neither for text-only warmup/rest steps, but never invalid IDs in service.

- [ ] **Step 4: Implement template service**

Service functions:
- `list_workout_templates(db, published_only=True, goal=None, difficulty=None, target=None, max_duration=None)`
- `get_workout_template_detail(db, template_id, published_only=True)`
- `create_workout_template(db, payload)`
- `update_workout_template(db, template_id, payload)`

Validate referenced exercises are published for user-visible templates and referenced workout modes are active.

- [ ] **Step 5: Add routes and router registration**

Register:
- `GET /api/workout-templates`
- `GET /api/workout-templates/{template_id}`
- `GET /api/admin/workout-templates`
- `POST /api/admin/workout-templates`
- `PUT /api/admin/workout-templates/{template_id}`

- [ ] **Step 6: Seed 6-8 templates**

Extend `seed_default_training_content` to seed templates after exercises. Seed at least: 入门下肢激活, 核心稳定, 上肢力量入门, 全身燃脂, 拉伸恢复, 零器械快速训练. Reuse existing exercise slugs when present and keep seed idempotent by slug.

- [ ] **Step 7: Run tests**

Run: `cd backend && pytest tests/test_workout_templates.py tests/test_health.py -v`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/workout_templates.py backend/app/services/workout_template_service.py backend/app/api/routes/workout_templates.py backend/app/api/routes/admin_content.py backend/app/api/router.py backend/app/services/content_seed.py backend/tests/test_workout_templates.py
git commit -m "feat: add workout template APIs"
```

### Task 3: Apply Templates to Editable Plan Items

**Files:**
- Modify: `backend/app/schemas/training_plans.py`
- Modify: `backend/app/services/training_plan_service.py`
- Modify: `backend/app/services/workout_template_service.py`
- Modify: `backend/app/api/routes/workout_templates.py`
- Test: `backend/tests/test_workout_templates.py`
- Test: `backend/tests/test_training_plan_routes.py`

- [ ] **Step 1: Add failing apply-to-plan tests**

```python
def test_apply_template_to_plan_copies_steps_not_template_references(client, create_user_and_token):
    _, admin_token = create_user_and_token("apply-admin@example.com", role="admin")
    _, user_token = create_user_and_token("apply-user@example.com")
    template = client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json={"slug": "apply-template", "title": "模板", "goal": "strength", "difficulty": "beginner", "target_muscles": "全身", "estimated_duration_minutes": 12, "tags": [], "is_published": True, "steps": [{"sort_order": 0, "title": "深蹲", "sets": 2, "reps": 10, "duration_seconds": None, "rest_seconds": 30, "instruction": "复制到课表", "allow_pose_detection": True}]},
    ).json()

    response = client.post(
        f"/api/workout-templates/{template['id']}/apply-to-plan",
        headers=_auth(user_token),
        json={"scheduled_date": "2026-06-08", "plan_title": "我的训练计划"},
    )

    assert response.status_code == 201
    item = response.json()["items"][0]
    assert item["title"] == "深蹲"
    assert item["source_template_id"] == template["id"]
    assert item["status"] == "planned"

    client.put(f"/api/admin/workout-templates/{template['id']}", headers=_auth(admin_token), json={"title": "已改模板", "steps": []})
    detail = client.get(f"/api/training-plans/{response.json()['id']}", headers=_auth(user_token)).json()
    assert detail["items"][0]["title"] == "深蹲"
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && pytest tests/test_workout_templates.py::test_apply_template_to_plan_copies_steps_not_template_references -v`

Expected: FAIL with 404 or missing endpoint.

- [ ] **Step 3: Extend plan item schemas**

Add `duration_seconds`, `rest_seconds`, `instruction`, `source_template_id`, `source_template_step_id`, `entry_type`, `status`, `linked_workout_session_id`, `completed_at`, `actual_duration_seconds`, `actual_score` to `TrainingPlanItemResponse`. Accept the editable planning fields on create/replace, but do not allow clients to set `linked_workout_session_id`, `completed_at`, `actual_duration_seconds`, or `actual_score` through plan editing endpoints.

- [ ] **Step 4: Implement apply-to-plan service**

Add `apply_template_to_plan(db, user_id, template_id, scheduled_date, plan_title)` that:
- reads only published template details,
- creates a training plan if the user has none active for the request,
- copies steps into `TrainingPlanItem` rows for the current version,
- stores `source_template_id` and `source_template_step_id` only for traceability,
- sets `entry_type="scheduled"` and `status="planned"`.

- [ ] **Step 5: Add route**

`POST /api/workout-templates/{template_id}/apply-to-plan`, returning `TrainingPlanDetailResponse` with `201`.

- [ ] **Step 6: Run tests**

Run: `cd backend && pytest tests/test_workout_templates.py tests/test_training_plan_routes.py -v`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/training_plans.py backend/app/services/training_plan_service.py backend/app/services/workout_template_service.py backend/app/api/routes/workout_templates.py backend/tests/test_workout_templates.py backend/tests/test_training_plan_routes.py
git commit -m "feat: copy workout templates into plans"
```

### Task 4: Today Training Aggregation

**Files:**
- Create: `backend/app/schemas/today.py`
- Create: `backend/app/services/today_training_service.py`
- Create: `backend/app/api/routes/today.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_today_training.py`

- [ ] **Step 1: Write failing today training tests**

```python
def test_today_training_prefers_planned_plan_item(client, create_user_and_token):
    _, token = create_user_and_token("today-plan@example.com")
    client.post("/api/training-plans", headers=_auth(token), json={"title": "本周", "items": [{"scheduled_date": "2026-06-07", "sort_order": 0, "title": "今日深蹲", "sets": 3, "reps": 12, "duration_seconds": 900, "rest_seconds": 45}], "change_summary": "today"})

    response = client.get("/api/today/training?date=2026-06-07", headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["source_type"] == "plan"
    assert response.json()["title"] == "今日深蹲"


def test_today_training_falls_back_to_template(client, create_user_and_token):
    _, admin_token = create_user_and_token("today-admin@example.com", role="admin")
    _, user_token = create_user_and_token("today-user@example.com")
    client.post("/api/admin/workout-templates", headers=_auth(admin_token), json={"slug": "today-template", "title": "推荐模板", "goal": "fat_loss", "difficulty": "beginner", "target_muscles": "全身", "estimated_duration_minutes": 15, "tags": [], "recommendation_weight": 20, "is_published": True, "steps": []})

    response = client.get("/api/today/training?date=2026-06-07", headers=_auth(user_token))

    assert response.status_code == 200
    assert response.json()["source_type"] == "template"
    assert response.json()["empty_state"] is None
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && pytest tests/test_today_training.py -v`

Expected: FAIL with missing `/api/today/training` route.

- [ ] **Step 3: Implement schemas and service**

`TodayWorkoutResponse` includes `source_type`, `source_id`, `title`, `description`, `estimated_duration_minutes`, `difficulty`, `target_muscles`, `steps`, `pose_detection_available`, `empty_state`, and optional summary fields for completed/skipped day state. The service accepts an optional date for tests, otherwise computes current date from `UserProfile.timezone`.

- [ ] **Step 4: Implement route**

Add `GET /api/today/training` with optional `date=YYYY-MM-DD`. Derive `user_id` from token. Return an empty-state response, not 404, when nothing is available.

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest tests/test_today_training.py -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/today.py backend/app/services/today_training_service.py backend/app/api/routes/today.py backend/app/api/router.py backend/tests/test_today_training.py
git commit -m "feat: add today training aggregation"
```

### Task 5: Workout Session Start and Finish Lifecycle

**Files:**
- Modify: `backend/app/schemas/workouts.py`
- Create: `backend/app/services/workout_session_service.py`
- Modify: `backend/app/services/workout_service.py`
- Modify: `backend/app/api/routes/workouts.py`
- Test: `backend/tests/test_workout_session_lifecycle.py`
- Existing test: `backend/tests/test_workout_sessions.py`

- [ ] **Step 1: Write failing lifecycle tests**

```python
def test_start_plan_workout_returns_step_snapshot(client, create_user_and_token):
    _, token = create_user_and_token("start-plan@example.com")
    plan = client.post("/api/training-plans", headers=_auth(token), json={"title": "本周", "items": [{"scheduled_date": "2026-06-07", "sort_order": 0, "title": "深蹲", "sets": 3, "reps": 12, "duration_seconds": 900}], "change_summary": "start"}).json()

    response = client.post("/api/workouts/sessions/start", headers=_auth(token), json={"source_type": "plan", "source_plan_id": plan["id"], "source_plan_item_id": plan["items"][0]["id"], "pose_detection_enabled": True})

    assert response.status_code == 201
    assert response.json()["pose_detection_enabled"] is True
    assert response.json()["steps"][0]["title"] == "深蹲"


def test_finish_workout_saves_steps_and_updates_plan_item(client, create_user_and_token):
    _, token = create_user_and_token("finish-plan@example.com")
    plan = client.post("/api/training-plans", headers=_auth(token), json={"title": "本周", "items": [{"scheduled_date": "2026-06-07", "sort_order": 0, "title": "深蹲", "sets": 3, "reps": 12, "duration_seconds": 900}], "change_summary": "finish"}).json()
    session = client.post("/api/workouts/sessions/start", headers=_auth(token), json={"source_type": "plan", "source_plan_id": plan["id"], "source_plan_item_id": plan["items"][0]["id"], "pose_detection_enabled": False}).json()

    response = client.put(f"/api/workouts/sessions/{session['id']}/finish", headers=_auth(token), json={"ended_at": "2026-06-07T08:20:00", "duration_minutes": 20, "calories_burned": 120, "status": "completed", "steps": [{"sort_order": 0, "title": "深蹲", "actual_reps": 36, "actual_duration_seconds": 880, "score": 90, "status": "completed"}]})

    assert response.status_code == 200
    assert response.json()["completed_steps_count"] == 1
    detail = client.get(f"/api/training-plans/{plan['id']}", headers=_auth(token)).json()
    assert detail["items"][0]["status"] == "completed"
    assert detail["items"][0]["actual_score"] == 90
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && pytest tests/test_workout_session_lifecycle.py -v`

Expected: FAIL with missing routes.

- [ ] **Step 3: Add start/finish schemas**

Add `WorkoutSessionStart`, `WorkoutSessionStartResponse`, `WorkoutSessionStepSnapshot`, `WorkoutSessionFinish`, `WorkoutSessionStepFinish`, and enriched `WorkoutSessionResponse` fields. Keep old `POST /api/workouts/sessions` working for legacy manual record creation.

- [ ] **Step 4: Implement session lifecycle service**

Start service creates `WorkoutSession` with source fields and a planned step snapshot from plan item or template. Finish service updates session, creates `WorkoutSessionStep` rows, computes completed counts, and updates linked plan item summary when `source_plan_item_id` is present.

- [ ] **Step 5: Add routes**

Add:
- `POST /api/workouts/sessions/start`
- `PUT /api/workouts/sessions/{session_id}/finish`

Both must enforce current-user ownership for plan items and sessions.

- [ ] **Step 6: Run tests**

Run: `cd backend && pytest tests/test_workout_session_lifecycle.py tests/test_workout_sessions.py -v`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/workouts.py backend/app/services/workout_session_service.py backend/app/services/workout_service.py backend/app/api/routes/workouts.py backend/tests/test_workout_session_lifecycle.py backend/tests/test_workout_sessions.py
git commit -m "feat: add workout session lifecycle"
```

### Task 6: Training Plan Reconciliation

**Files:**
- Create: `backend/app/services/training_reconciliation_service.py`
- Modify: `backend/app/api/routes/training_plans.py`
- Modify: `backend/app/schemas/training_plans.py`
- Test: `backend/tests/test_training_reconciliation.py`

- [ ] **Step 1: Write failing reconciliation tests**

```python
def test_reconcile_marks_missed_yesterday_as_skipped(client, create_user_and_token):
    _, token = create_user_and_token("skip-yesterday@example.com")
    plan = client.post("/api/training-plans", headers=_auth(token), json={"title": "本周", "items": [{"scheduled_date": "2026-06-06", "sort_order": 0, "title": "昨日训练", "duration_seconds": 900}], "change_summary": "skip"}).json()

    response = client.post("/api/training-plans/reconcile", headers=_auth(token), json={"today": "2026-06-07"})

    assert response.status_code == 200
    detail = client.get(f"/api/training-plans/{plan['id']}", headers=_auth(token)).json()
    assert detail["items"][0]["status"] == "skipped"


def test_reconcile_adds_ad_hoc_template_session_to_calendar(client, create_user_and_token):
    _, admin_token = create_user_and_token("adhoc-admin@example.com", role="admin")
    _, user_token = create_user_and_token("adhoc-user@example.com")
    template = client.post("/api/admin/workout-templates", headers=_auth(admin_token), json={"slug": "adhoc-template", "title": "临时训练", "goal": "strength", "difficulty": "beginner", "target_muscles": "全身", "estimated_duration_minutes": 10, "tags": [], "is_published": True, "steps": []}).json()
    session = client.post("/api/workouts/sessions/start", headers=_auth(user_token), json={"source_type": "template", "source_template_id": template["id"], "pose_detection_enabled": False}).json()
    client.put(f"/api/workouts/sessions/{session['id']}/finish", headers=_auth(user_token), json={"ended_at": "2026-06-06T08:10:00", "duration_minutes": 10, "calories_burned": 60, "status": "completed", "steps": []})

    response = client.post("/api/training-plans/reconcile", headers=_auth(user_token), json={"today": "2026-06-07"})

    assert response.status_code == 200
    assert response.json()["ad_hoc_entries_created"] == 1
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend && pytest tests/test_training_reconciliation.py -v`

Expected: FAIL with missing reconcile route/service.

- [ ] **Step 3: Implement schemas and service**

`TrainingPlanReconcileRequest` accepts optional `today` for tests. Production callers omit it. The service computes yesterday from the user profile timezone, marks stale `scheduled/planned` items as `skipped`, preserves completed/partial items, and creates `ad_hoc` calendar entries for completed template/free sessions not already linked.

- [ ] **Step 4: Add route**

`POST /api/training-plans/reconcile` derives current user from token and calls the service. Keep batching/scheduling out of this task; expose the service so a future scheduler can batch users.

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest tests/test_training_reconciliation.py tests/test_today_training.py -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/training_reconciliation_service.py backend/app/api/routes/training_plans.py backend/app/schemas/training_plans.py backend/tests/test_training_reconciliation.py
git commit -m "feat: reconcile training plan calendar"
```

### Task 7: Frontend API Types, Routes, and Shared Training Helpers

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/routes/UserRoutes.tsx`
- Modify: `frontend/src/routes/AdminRoutes.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/training/trainingFlow.ts`
- Create: `frontend/src/training/trainingFlow.test.ts`

- [ ] **Step 1: Write failing helper tests**

```typescript
import { describe, expect, it } from "vitest";

import { summarizeWorkoutSteps, nextStepIndex } from "./trainingFlow";

describe("training flow helpers", () => {
  it("summarizes completed steps and average score", () => {
    const summary = summarizeWorkoutSteps([
      { status: "completed", score: 90, actual_duration_seconds: 600 },
      { status: "skipped", score: null, actual_duration_seconds: 0 },
    ]);

    expect(summary.completedSteps).toBe(1);
    expect(summary.averageScore).toBe(90);
    expect(summary.durationSeconds).toBe(600);
  });

  it("advances to the next step without overflowing", () => {
    expect(nextStepIndex(0, 3)).toBe(1);
    expect(nextStepIndex(2, 3)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd frontend && npm test -- src/training/trainingFlow.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Add API types and helpers**

Add `WorkoutTemplate`, `WorkoutTemplateStep`, `TodayWorkout`, `WorkoutSessionStartPayload`, `WorkoutSessionStartResponse`, `WorkoutSessionFinishPayload`, and extended `TrainingPlanItem` fields. Add functions: `fetchTodayTraining`, `fetchWorkoutTemplates`, `fetchWorkoutTemplate`, `applyWorkoutTemplateToPlan`, `startWorkoutSession`, `finishWorkoutSession`, `reconcileTrainingPlans`, admin template CRUD helpers.

- [ ] **Step 4: Add routes and minimal route screens**

Add routes:
- `/app/train/templates/:templateId`
- `/app/train/overview`
- `/app/train/session/:sessionId`
- `/app/train/session/:sessionId/review`
- `/admin/workout-templates`

Update bottom nav to keep `首页`, `训练`, `课表`, `饮食`, `榜单`, `我的`; move AI settings link into profile/settings area in a later frontend task.

- [ ] **Step 5: Implement helpers**

`summarizeWorkoutSteps` should ignore null scores for averages and sum non-null actual durations. `nextStepIndex` should clamp at the last step.

- [ ] **Step 6: Run tests/build**

Run: `cd frontend && npm test -- src/training/trainingFlow.test.ts`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS. If a new route imports a page that is not built until the next task, create a minimal page component with the final exported component name before committing.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/routes/UserRoutes.tsx frontend/src/routes/AdminRoutes.tsx frontend/src/components/Layout.tsx frontend/src/training/trainingFlow.ts frontend/src/training/trainingFlow.test.ts
git commit -m "feat: add training loop frontend contracts"
```

### Task 8: User Home, Template Library, and Training Overview

**Files:**
- Modify: `frontend/src/pages/user/HomePage.tsx`
- Modify: `frontend/src/pages/user/TrainingPage.tsx`
- Create: `frontend/src/pages/user/TrainingOverviewPage.tsx`
- Modify: `frontend/src/pages/user/ProfilePage.tsx`

- [ ] **Step 1: Build home action center**

Replace the current card grid with a today-training panel. States:
- plan source with primary `开始训练`,
- template fallback with `开始推荐训练` and `加入课表`,
- empty state with profile/template guidance.

Use `fetchTodayTraining()` and keep secondary stats from `fetchWorkoutSummary()`.

- [ ] **Step 2: Rebuild training page around templates**

Change `TrainingPage` default tab to template library. Include filters for goal, difficulty, max duration, and target muscle text. Keep recent history below the template library and move manual record creation into a secondary collapsible section or `tab=records`.

- [ ] **Step 3: Add training overview page**

The overview reads URL params for `sourceType`, `sourceId`, `planId`, `planItemId`, or `templateId`. It fetches template detail or today training, shows steps, and includes a toggle `开启姿态检测`. On start, call `startWorkoutSession()` and navigate to `/app/train/session/:sessionId` with session data persisted in `sessionStorage` under `smart-gym-active-session:{id}`.

- [ ] **Step 4: Move AI settings entry**

Add an AI Provider settings link inside `ProfilePage` so removing it from bottom nav does not hide the feature.

- [ ] **Step 5: Verify frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/user/HomePage.tsx frontend/src/pages/user/TrainingPage.tsx frontend/src/pages/user/TrainingOverviewPage.tsx frontend/src/pages/user/ProfilePage.tsx
git commit -m "feat: add today training entry points"
```

### Task 9: Guided Player, Pose Reuse, and Review Page

**Files:**
- Create: `frontend/src/components/PoseDetectionPanel.tsx`
- Modify: `frontend/src/pages/user/PoseDetectionPage.tsx`
- Create: `frontend/src/pages/user/GuidedWorkoutPage.tsx`
- Create: `frontend/src/pages/user/WorkoutReviewPage.tsx`
- Modify: `frontend/src/routes/UserRoutes.tsx`
- Modify: `frontend/src/training/trainingFlow.ts`
- Modify: `frontend/src/training/trainingFlow.test.ts`

- [ ] **Step 1: Extract pose detection panel**

Move reusable camera start/stop/detection loop logic from `PoseDetectionPage` into `PoseDetectionPanel`. The panel props should include `exercise`, `workoutMode`, `enabled`, `title`, and `onSnapshotChange`. Keep debug logging support available to the standalone pose page.

- [ ] **Step 2: Keep standalone pose page working**

Refactor `PoseDetectionPage` to render `PoseDetectionPanel` and keep existing save/advice behavior. Run existing pose tests after extraction.

Run: `cd frontend && npm test -- src/pose/poseMetrics.test.ts src/pose/cameraSupport.test.ts src/pose/mediapipe.test.ts`

Expected: PASS.

- [ ] **Step 3: Build guided player**

`GuidedWorkoutPage` loads active session data from `sessionStorage` and provides step navigation, pause/resume, skip, and finish. If `pose_detection_enabled` is true, render `PoseDetectionPanel` for the current step. Do not ask per-step permission; permission happened on overview.

- [ ] **Step 4: Finish session and review**

On finish, call `finishWorkoutSession()` with step results, aggregate duration, calories estimate, scores, and optional pose result IDs. Store final response in `sessionStorage` under `smart-gym-finished-session:{id}` and navigate to review.

- [ ] **Step 5: Build review page**

Show completed steps, actual duration, calories, score summary, pose feedback summary, and links to `课表` and `训练`.

- [ ] **Step 6: Run frontend verification**

Run: `cd frontend && npm test -- src/training/trainingFlow.test.ts src/pose/poseMetrics.test.ts src/pose/cameraSupport.test.ts src/pose/mediapipe.test.ts`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/PoseDetectionPanel.tsx frontend/src/pages/user/PoseDetectionPage.tsx frontend/src/pages/user/GuidedWorkoutPage.tsx frontend/src/pages/user/WorkoutReviewPage.tsx frontend/src/routes/UserRoutes.tsx frontend/src/training/trainingFlow.ts frontend/src/training/trainingFlow.test.ts
git commit -m "feat: add guided workout player"
```

### Task 10: Plan Calendar as Training Record View

**Files:**
- Modify: `frontend/src/pages/user/TrainingPlansPage.tsx`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Update calendar item rendering**

Display item `status`, `entry_type`, `actual_duration_seconds`, `actual_score`, and `linked_workout_session_id`. Use restrained labels: `计划`, `完成`, `部分`, `跳过`, `顺延`, `临时`.

- [ ] **Step 2: Preserve edit behavior**

When editing a planned item, keep existing editing workflow. Do not expose linked result summary fields in edit form. For `ad_hoc` entries, show record details but disable editing as a future plan item.

- [ ] **Step 3: Add reconcile action for local/dev**

Add a small icon button in the plan page header with tooltip `同步训练记录` that calls `reconcileTrainingPlans()`, reloads the plan, and reports status. This is useful until a scheduler exists.

- [ ] **Step 4: Run build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/user/TrainingPlansPage.tsx frontend/src/api/client.ts
git commit -m "feat: show training records on plan calendar"
```

### Task 11: Admin Workout Template Maintenance

**Files:**
- Create: `frontend/src/pages/admin/AdminWorkoutTemplatesPage.tsx`
- Modify: `frontend/src/routes/AdminRoutes.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/pages/admin/AdminHomePage.tsx`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add admin template page**

Build a single page using the same interaction pattern as `AdminExercisesPage`: list templates, create/edit dialog, publish toggle, step editor, and JSON-free controls for common fields. Step editor should allow title, sort order, exercise selection, workout mode selection, sets, reps, duration seconds, rest seconds, instruction, and detection toggle.

- [ ] **Step 2: Add route/nav/home entries**

Add `/admin/workout-templates`, admin nav item `模板`, and admin home card `训练模板`.

- [ ] **Step 3: Validate client-side payloads**

Reject missing slug/title/goal/target muscles and negative duration/rest fields before API call. Keep server validation as source of truth.

- [ ] **Step 4: Run build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminWorkoutTemplatesPage.tsx frontend/src/routes/AdminRoutes.tsx frontend/src/components/Layout.tsx frontend/src/pages/admin/AdminHomePage.tsx frontend/src/api/client.ts
git commit -m "feat: add admin workout template editor"
```

### Task 12: Full Regression and Manual Smoke Test

**Files:**
- No new files unless fixing defects found by verification.

- [ ] **Step 1: Run backend regression**

Run: `cd backend && pytest -v`

Expected: PASS.

- [ ] **Step 2: Run frontend tests and build**

Run: `cd frontend && npm test`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 3: Start local services for smoke test**

Run backend in one shell:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run frontend in another shell:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

- [ ] **Step 4: Browser smoke test**

Use the app browser at `http://127.0.0.1:5173` and verify:
- login works,
- home shows today training or template recommendation,
- template can be started from overview,
- pose toggle can be left off and session still finishes,
- review page appears,
- plan calendar shows completed/ad-hoc record after reconcile,
- admin can create and publish a template.

- [ ] **Step 5: Final commit for verification fixes**

If smoke test required fixes, inspect the changed paths and stage only the files that belong to those fixes:

```bash
git status --short
git commit -m "fix: stabilize training loop smoke test"
```

Before running the commit command, replace the missing staging step by running `git add` with the exact file paths shown by `git status --short` that were changed for the smoke-test fix. Do not stage `.superpowers/` or unrelated user changes.

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: template data source, editable copied plan items, today training aggregation, guided player, one-time pose opt-in per workout, session step results, plan calendar reconciliation, user timezone, admin template maintenance, seed data, and tests are all mapped to tasks.
- Red-flag scan: this plan avoids vague deferred work. Where implementation choices remain, the required behavior, files, commands, and expected results are explicit.
- Type consistency: core names are consistent across tasks: `WorkoutTemplate`, `WorkoutTemplateStep`, `WorkoutSessionStep`, `TodayWorkout`, `entry_type`, `status`, `source_plan_item_id`, `pose_detection_enabled`, and `TrainingPlanReconciliationService`.
