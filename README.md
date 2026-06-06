# Smart Gym

Smart Gym is a Phase 1 platform skeleton for a mobile-first smart gym product. It includes a FastAPI backend, PostgreSQL/SQLAlchemy models, authentication, user profiles, user-isolated AI Provider settings, a local storage helper, and a React PWA shell with separated user/admin routes.

## Backend

Install dependencies from the backend project:

```bash
cd backend
python -m pip install -e ".[dev]"
```

If your machine does not provide a `python` command, use the Python executable from your virtual environment or replace `python` with your local Python command.

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Run Alembic commands from `backend/`:

```bash
cd backend
alembic revision --autogenerate -m "init"
alembic upgrade head
```

Run the backend with the PostgreSQL `DATABASE_URL` configured in `backend/.env`:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On startup, the backend ensures a default administrator account exists:

```text
account: admin
password: admin123
```

If the `admin` account already exists, startup leaves it unchanged.

Run backend tests:

```bash
cd backend
python -m pytest -v
```

The default database URL is:

```text
postgresql+psycopg://smart_gym:smart_gym@localhost:5432/smart_gym
```

Tests use `TEST_DATABASE_URL` when set, otherwise they use an isolated in-memory SQLite database.

## Frontend

Install and build the React PWA:

```bash
cd frontend
npm install
npm run build
```

Run the frontend dev server:

```bash
cd frontend
npm run dev
```

By default, the frontend calls `/api` and Vite proxies it to `http://127.0.0.1:8000`. Set `VITE_API_BASE_URL` to override the API base URL.

## Local Storage

Backend file storage defaults to `backend/storage`. The helper in `app.core.storage` keeps generated file paths inside the storage root and rejects parent-directory traversal such as `../file.png`.

Set `LOCAL_STORAGE_DIR` to use a different storage root in local development or tests.

## AI Provider Isolation

AI Provider configs are private per user. The backend always derives ownership from the authenticated token, never from a client-supplied `user_id`.

API responses omit both plaintext `api_key` and stored `api_key_encrypted`. The Phase 1 key wrapper is development-grade and should be replaced with production secret storage before handling real credentials.
