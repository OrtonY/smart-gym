# 智慧健身房第 1 期平台骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建智慧健身房的第 1 期平台骨架，包括 FastAPI 后端、PostgreSQL 连接、认证、用户资料、按用户隔离的 AI Provider 配置、React PWA 壳、用户端/管理端路由隔离和基础测试。

**Architecture:** 后端使用单体 FastAPI，但按 `core`、`models`、`schemas`、`services`、`api` 分层。前端使用一个 React 应用，通过路由和权限区分用户端与管理端。数据库使用 PostgreSQL，文件存储预留在后端本地目录。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy 2.x、Alembic、PostgreSQL、pytest、httpx、React、Vite、TypeScript、Tailwind CSS、React Router。

---

## 范围说明

本计划只实现第 1 期平台骨架。训练记录、榜单、AI 课表、AI 食谱、食物识别、动作检测和手环数据只在本期保留可扩展边界，不实现完整业务。

对应规格文档：

- `docs/superpowers/specs/2026-06-05-smart-gym-design.md`

## 目标文件结构

```text
backend/
  pyproject.toml
  alembic.ini
  app/
    __init__.py
    main.py
    api/
      __init__.py
      router.py
      deps.py
      routes/
        __init__.py
        auth.py
        users.py
        ai_configs.py
        health.py
    core/
      __init__.py
      config.py
      database.py
      security.py
      storage.py
    models/
      __init__.py
      base.py
      user.py
      user_profile.py
      ai_provider_config.py
    schemas/
      __init__.py
      auth.py
      users.py
      ai_configs.py
    services/
      __init__.py
      auth_service.py
      user_service.py
      ai_config_service.py
    migrations/
      env.py
      script.py.mako
      versions/
    tests/
      conftest.py
      test_health.py
      test_auth.py
      test_user_profiles.py
      test_ai_provider_configs.py
frontend/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  src/
    main.tsx
    App.tsx
    api/client.ts
    auth/AuthContext.tsx
    routes/UserRoutes.tsx
    routes/AdminRoutes.tsx
    pages/LoginPage.tsx
    pages/RegisterPage.tsx
    pages/user/HomePage.tsx
    pages/user/ProfilePage.tsx
    pages/user/AiProviderSettingsPage.tsx
    pages/admin/AdminHomePage.tsx
    components/Layout.tsx
docker-compose.yml
.gitignore
README.md
```

## Task 1: 后端项目脚手架与健康检查

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/core/config.py`
- Create: `backend/tests/test_health.py`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_health.py` 写健康检查测试：

```python
from fastapi.testclient import TestClient

from app.main import app


def test_health_check_returns_ok():
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd backend
python -m pytest tests/test_health.py -v
```

Expected: FAIL，原因是 `app.main` 或 `/api/health` 尚不存在。

- [ ] **Step 3: 实现最小后端应用**

创建 `backend/pyproject.toml`，包含依赖：

```toml
[project]
name = "smart-gym-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "pydantic-settings",
  "sqlalchemy",
  "psycopg[binary]",
  "alembic",
  "passlib[bcrypt]",
  "python-jose[cryptography]",
  "python-multipart",
]

[project.optional-dependencies]
dev = ["pytest", "httpx"]

[tool.pytest.ini_options]
pythonpath = ["."]
```

`backend/app/main.py`：

```python
from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="Smart Gym API")
app.include_router(api_router, prefix="/api")
```

`backend/app/api/router.py`：

```python
from fastapi import APIRouter

from app.api.routes import health

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
```

`backend/app/api/routes/health.py`：

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
cd backend
python -m pytest tests/test_health.py -v
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .gitignore README.md backend
git commit -m "feat: scaffold FastAPI backend"
```

## Task 2: PostgreSQL、SQLAlchemy 与 Alembic 基础

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/alembic.ini`
- Create: `backend/app/core/database.py`
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/user_profile.py`
- Create: `backend/app/models/ai_provider_config.py`
- Create: `backend/app/migrations/env.py`
- Create: `backend/app/migrations/script.py.mako`
- Create: `backend/tests/conftest.py`

- [ ] **Step 0: 启动 PostgreSQL**

Run:

```bash
docker-compose up -d postgres
```

Expected: PostgreSQL container starts and listens on `localhost:5432`.

- [ ] **Step 1: 写模型测试**

在 `backend/tests/test_database_models.py` 写测试，验证模型能创建表并有关键字段：

```python
from app.models.ai_provider_config import AiProviderConfig
from app.models.user import User
from app.models.user_profile import UserProfile


def test_models_have_user_isolation_fields():
    assert "id" in User.__table__.columns
    assert "role" in User.__table__.columns
    assert "user_id" in UserProfile.__table__.columns
    assert "user_id" in AiProviderConfig.__table__.columns
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend
python -m pytest tests/test_database_models.py -v
```

Expected: FAIL，模型文件尚不存在。

- [ ] **Step 3: 实现数据库配置和模型**

`backend/app/core/database.py` 使用 SQLAlchemy 2.x：

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/app/core/config.py`：

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://smart_gym:smart_gym@localhost:5432/smart_gym"
    jwt_secret_key: str = "change-me-in-dev"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    local_storage_dir: str = "storage"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
```

模型最小字段：

- `User`: `id`、`email`、`hashed_password`、`display_name`、`avatar_url`、`role`、`is_active`、`created_at`。
- `UserProfile`: `id`、`user_id`、`height_cm`、`weight_kg`、`fitness_goal`、`training_frequency`、`dietary_preferences`。
- `AiProviderConfig`: `id`、`user_id`、`provider_type`、`base_url`、`model_name`、`api_key_encrypted`、`is_active`。

- [ ] **Step 4: 添加 PostgreSQL compose**

`docker-compose.yml`：

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: smart_gym
      POSTGRES_USER: smart_gym
      POSTGRES_PASSWORD: smart_gym
    ports:
      - "5432:5432"
    volumes:
      - smart_gym_postgres:/var/lib/postgresql/data

volumes:
  smart_gym_postgres:
```

- [ ] **Step 5: 实现测试 fixture**

`backend/tests/conftest.py` 必须提供：

- `db_session`：每个测试前创建表，测试后清理表。
- `client`：覆盖 `get_db`，让接口测试使用同一个测试 session。
- `create_user_and_token`：创建用户并返回 `(user, token)`，供隔离测试复用。

示例结构：

```python
import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, engine, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    from app.core.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def create_user_and_token(db_session):
    def factory(email: str, role: str = "user"):
        user = User(
            email=email,
            display_name=email.split("@")[0],
            hashed_password=hash_password("Passw0rd!"),
            role=role,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        token = create_access_token(str(user.id))
        return user, token

    return factory
```

- [ ] **Step 6: 配置 Alembic**

`backend/alembic.ini` 的 `script_location` 指向 `app/migrations`。`backend/app/migrations/env.py` 必须导入 `Base.metadata` 和所有模型，保证迁移能识别表结构。

- [ ] **Step 7: 运行测试确认通过**

```bash
cd backend
python -m pytest tests/test_database_models.py -v
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add docker-compose.yml backend
git commit -m "feat: add PostgreSQL models"
```

## Task 3: 认证、当前用户与权限基础

**Files:**
- Create: `backend/app/core/security.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/routes/auth.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/services/auth_service.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_auth.py`

- [ ] **Step 1: 写认证测试**

`backend/tests/test_auth.py`：

```python
def test_register_login_and_me(client):
    register_response = client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "password": "Passw0rd!",
            "display_name": "训练者",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "Passw0rd!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend
python -m pytest tests/test_auth.py -v
```

Expected: FAIL，认证接口尚不存在。

- [ ] **Step 3: 实现密码哈希和 JWT**

`backend/app/core/security.py` 提供：

- `hash_password(password: str) -> str`
- `verify_password(password: str, hashed_password: str) -> bool`
- `create_access_token(subject: str) -> str`
- `decode_access_token(token: str) -> str`

- [ ] **Step 4: 实现认证接口**

`backend/app/api/routes/auth.py`：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

注册接口创建普通用户，默认 `role="user"`。

- [ ] **Step 5: 实现依赖**

`backend/app/api/deps.py`：

- `get_current_user`
- `require_admin`

`require_admin` 本期用于保护管理端基础接口。

- [ ] **Step 6: 运行测试确认通过**

```bash
cd backend
python -m pytest tests/test_auth.py -v
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add backend
git commit -m "feat: add authentication"
```

## Task 4: 用户资料接口

**Files:**
- Create: `backend/app/api/routes/users.py`
- Create: `backend/app/schemas/users.py`
- Create: `backend/app/services/user_service.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_user_profiles.py`

- [ ] **Step 1: 写用户隔离测试**

```python
def test_user_can_only_read_own_profile(client, create_user_and_token):
    user_a, token_a = create_user_and_token("a@example.com")
    user_b, token_b = create_user_and_token("b@example.com")

    response = client.put(
        "/api/users/me/profile",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"height_cm": 180, "weight_kg": 75, "fitness_goal": "增肌"},
    )
    assert response.status_code == 200

    own = client.get("/api/users/me/profile", headers={"Authorization": f"Bearer {token_a}"})
    other = client.get("/api/users/me/profile", headers={"Authorization": f"Bearer {token_b}"})

    assert own.json()["fitness_goal"] == "增肌"
    assert other.json() == {}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend
python -m pytest tests/test_user_profiles.py -v
```

Expected: FAIL，资料接口尚不存在。

- [ ] **Step 3: 实现接口**

`backend/app/api/routes/users.py`：

- `GET /api/users/me/profile`
- `PUT /api/users/me/profile`

接口不接收 `user_id`，只使用 `get_current_user`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend
python -m pytest tests/test_user_profiles.py -v
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend
git commit -m "feat: add user profile endpoints"
```

## Task 5: 按用户隔离的 AI Provider 配置接口

**Files:**
- Create: `backend/app/api/routes/ai_configs.py`
- Create: `backend/app/schemas/ai_configs.py`
- Create: `backend/app/services/ai_config_service.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_ai_provider_configs.py`

- [ ] **Step 1: 写隔离测试**

```python
def test_ai_provider_configs_are_user_isolated(client, create_user_and_token):
    _, token_a = create_user_and_token("a@example.com")
    _, token_b = create_user_and_token("b@example.com")

    create_response = client.post(
        "/api/ai-configs",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "provider_type": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model_name": "example-model",
            "api_key": "secret-key",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201

    configs_a = client.get("/api/ai-configs", headers={"Authorization": f"Bearer {token_a}"})
    configs_b = client.get("/api/ai-configs", headers={"Authorization": f"Bearer {token_b}"})

    assert len(configs_a.json()) == 1
    assert configs_b.json() == []
    assert "api_key" not in configs_a.json()[0]
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend
python -m pytest tests/test_ai_provider_configs.py -v
```

Expected: FAIL，AI 配置接口尚不存在。

- [ ] **Step 3: 实现接口**

`backend/app/api/routes/ai_configs.py`：

- `GET /api/ai-configs`
- `POST /api/ai-configs`
- `PUT /api/ai-configs/{config_id}`
- `DELETE /api/ai-configs/{config_id}`

所有查询必须按当前用户过滤。返回结果不能包含明文 API Key。

- [ ] **Step 4: 实现密钥保存策略**

第一版可使用开发级加密封装：

- 存储字段为 `api_key_encrypted`。
- 服务层提供 `encrypt_api_key` 和 `decrypt_api_key`。
- 测试环境可使用确定性测试密钥。

不要在日志或响应体中输出明文 API Key。

- [ ] **Step 5: 运行测试确认通过**

```bash
cd backend
python -m pytest tests/test_ai_provider_configs.py -v
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add backend
git commit -m "feat: add user AI provider configs"
```

## Task 6: 后端本地文件存储基础

**Files:**
- Create: `backend/app/core/storage.py`
- Create: `backend/storage/.gitkeep`
- Test: `backend/tests/test_storage.py`

- [ ] **Step 1: 写存储测试**

```python
from app.core.storage import get_storage_path


def test_storage_path_stays_inside_backend_storage(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path))

    path = get_storage_path("tutorials/demo.png")

    assert str(path).startswith(str(tmp_path))
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend
python -m pytest tests/test_storage.py -v
```

Expected: FAIL，存储工具不存在。

- [ ] **Step 3: 实现存储工具**

`backend/app/core/storage.py` 提供：

- `get_storage_root() -> Path`
- `get_storage_path(relative_path: str) -> Path`

要求：

- 默认目录为 `backend/storage`。
- 禁止 `../` 路径逃逸。
- 创建目录时只创建需要的父目录。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend
python -m pytest tests/test_storage.py -v
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend
git commit -m "feat: add local storage helper"
```

## Task 7: React PWA 前端脚手架与路由隔离

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/routes/UserRoutes.tsx`
- Create: `frontend/src/routes/AdminRoutes.tsx`
- Create: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: 创建 Vite React 项目结构**

使用 React + TypeScript + Tailwind。不要引入重型后台组件库。

- [ ] **Step 2: 实现路由隔离**

`frontend/src/App.tsx` 应包含：

- `/login`
- `/register`
- `/app/*` 用户端路由
- `/admin/*` 管理端路由

`UserRoutes.tsx` 只放用户端页面，`AdminRoutes.tsx` 只放管理端页面。

- [ ] **Step 3: 添加基础布局**

`Layout.tsx` 提供移动端优先布局：

- 底部用户端导航。
- 管理端顶部或侧边轻量导航。
- 不使用后台系统默认的死板大表格首页。

- [ ] **Step 4: 运行前端构建**

```bash
cd frontend
npm install
npm run build
```

Expected: build succeeds。

- [ ] **Step 5: 提交**

```bash
git add frontend
git commit -m "feat: scaffold React PWA routes"
```

## Task 8: 前端认证、资料页与 AI 配置页

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/auth/AuthContext.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Create: `frontend/src/pages/RegisterPage.tsx`
- Create: `frontend/src/pages/user/HomePage.tsx`
- Create: `frontend/src/pages/user/ProfilePage.tsx`
- Create: `frontend/src/pages/user/AiProviderSettingsPage.tsx`
- Create: `frontend/src/pages/admin/AdminHomePage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/UserRoutes.tsx`
- Modify: `frontend/src/routes/AdminRoutes.tsx`

- [ ] **Step 1: 实现 API Client**

`frontend/src/api/client.ts`：

- 读取 `VITE_API_BASE_URL`。
- 自动附加 `Authorization` token。
- 对 401 做统一处理。

- [ ] **Step 2: 实现 AuthContext**

`AuthContext` 提供：

- `token`
- `currentUser`
- `login`
- `logout`
- `register`
- `refreshCurrentUser`

- [ ] **Step 3: 实现页面**

页面要求：

- 登录页和注册页能调用后端接口。
- 用户首页展示今日计划入口卡片、AI 教练入口卡片、训练入口卡片。
- 资料页能读取和更新 `/api/users/me/profile`。
- AI 配置页能创建、列出、更新、删除当前用户自己的 Provider 配置。
- 管理首页展示内容管理入口卡片。

- [ ] **Step 4: 运行构建**

```bash
cd frontend
npm run build
```

Expected: build succeeds。

- [ ] **Step 5: 提交**

```bash
git add frontend
git commit -m "feat: add frontend auth and settings pages"
```

## Task 9: 全量验证与运行文档

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 更新 README**

README 至少包含：

- 后端安装命令。
- PostgreSQL 启动命令。
- Alembic 迁移命令。
- 后端测试命令。
- 前端安装和构建命令。
- 本地文件存储目录说明。
- AI Provider 配置隔离说明。

- [ ] **Step 2: 运行后端测试**

```bash
cd backend
python -m pytest -v
```

Expected: all tests pass。

- [ ] **Step 3: 运行前端构建**

```bash
cd frontend
npm run build
```

Expected: build succeeds。

- [ ] **Step 4: 检查 Git 状态**

```bash
git status --short
```

Expected: only intended files are changed。

- [ ] **Step 5: 提交**

```bash
git add README.md .gitignore
git commit -m "docs: add local development guide"
```

## 完成标准

- `docker-compose up -d postgres` 能启动 PostgreSQL。
- 后端 `/api/health` 可访问。
- 用户可以注册、登录、读取当前用户。
- 用户资料只能访问自己的数据。
- AI Provider 配置按用户隔离，响应不返回明文 API Key。
- 后端本地存储工具阻止路径逃逸。
- React 应用存在用户端 `/app/*` 和管理端 `/admin/*` 路由隔离。
- 前端构建通过。
- 后端测试通过。
- 所有改动都有小步提交。

## 后续计划

第 1 期完成后，再分别编写并执行：

- 第 2 期训练与榜单计划。
- 第 3 期 AI 课表与食谱计划。
- 第 4 期动作检测计划。
- 第 5 期食物识别与手环预留计划。
