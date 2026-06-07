# 智慧健身房第 5 期食物识别与手环预留 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现第 5 期闭环：用户上传食物图片后保存私有饮食记录并估算热量，同时提供设备心率数据模型和模拟导入 API。

**Architecture:** 后端沿用 FastAPI 分层结构，新增 `nutrition_logs` 与 `device_metrics` 私有表，所有读写从 JWT 当前用户推导 `user_id`。食物识别复用用户级 AI Provider 配置，图片保存到后端本地存储；Provider 不可用时允许用户用文本和手动修正继续保存记录。前端新增 `/app/nutrition` 页面，提供图片上传、文本识别、手动修正、营养日志和模拟心率导入。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy 2.x、Alembic、pytest、React、Vite、TypeScript、Tailwind CSS、lucide-react。

---

## 范围说明

本计划只实现规格中的第 5 期：食物图片识别、热量估算、饮食记录、手环数据模型、模拟心率导入。食谱版本化、真实硬件协议、复杂营养统计和移动端原生能力不在本期范围内。

## 目标文件结构

```text
backend/app/models/nutrition_log.py
backend/app/models/device_metric.py
backend/app/schemas/nutrition.py
backend/app/schemas/devices.py
backend/app/services/nutrition_service.py
backend/app/services/device_service.py
backend/app/api/routes/nutrition.py
backend/app/api/routes/devices.py
backend/app/services/ai_service.py
backend/app/migrations/versions/20260607_phase5_nutrition_devices.py
backend/tests/test_phase5_models.py
backend/tests/test_nutrition.py
backend/tests/test_devices.py
frontend/src/pages/user/NutritionPage.tsx
frontend/src/routes/UserRoutes.tsx
frontend/src/components/Layout.tsx
frontend/src/api/client.ts
```

## Tasks

### Task 1: 数据模型与迁移

**Files:** create model, migration, and model tests listed above.

- [ ] Add `NutritionLog` with private `user_id`, food fields, image path, AI metadata, correction text, and timestamps.
- [ ] Add `DeviceMetric` with private `user_id`, metric type, source, measured time, numeric values, and raw JSON.
- [ ] Import both models in `backend/app/models/__init__.py` and `backend/tests/conftest.py`.
- [ ] Create Alembic migration `20260607_phase5_nutrition_devices.py` after `20260607_phase4_pose`.
- [ ] Run `cd backend && pytest tests/test_phase5_models.py -v`.

### Task 2: Nutrition API

**Files:** create `schemas/nutrition.py`, `services/nutrition_service.py`, `api/routes/nutrition.py`; modify router and AI service.

- [ ] Add schemas for manual log create, AI recognition request, AI recognition response, correction update, and log response.
- [ ] Add service functions that save uploads under local storage, create/list/get/update only current-user logs, and reject cross-user reads.
- [ ] Add `generate_food_recognition` in `ai_service.py` with fake response support through `SMART_GYM_AI_FAKE_RESPONSES=true`.
- [ ] Add endpoints: `POST /api/nutrition/logs`, `POST /api/nutrition/recognize`, `GET /api/nutrition/logs`, `GET /api/nutrition/logs/{id}`, `PUT /api/nutrition/logs/{id}/correction`.
- [ ] Run `cd backend && pytest tests/test_nutrition.py -v`.

### Task 3: Devices API

**Files:** create `schemas/devices.py`, `services/device_service.py`, `api/routes/devices.py`; modify router.

- [ ] Add schemas for simulated heart-rate import and device metric response.
- [ ] Add service functions to create/list current-user device metrics and compute latest heart-rate summary.
- [ ] Add endpoints: `POST /api/devices/heart-rate/import`, `GET /api/devices/metrics`, `GET /api/devices/heart-rate/summary`.
- [ ] Run `cd backend && pytest tests/test_devices.py -v`.

### Task 4: Frontend Nutrition Page

**Files:** modify `frontend/src/api/client.ts`, create `NutritionPage.tsx`, update user routes and layout nav.

- [ ] Add TypeScript types and API helpers for nutrition logs and device metrics.
- [ ] Add `/app/nutrition` page with image/text recognition, manual corrections, recent logs, and simulated heart-rate import.
- [ ] Add navigation entry from home and bottom nav.
- [ ] Run `cd frontend && npm run build`.

### Task 5: Regression

**Files:** no new files.

- [ ] Run `cd backend && pytest`.
- [ ] Run `cd frontend && npm test`.
- [ ] Run `cd frontend && npm run build`.

