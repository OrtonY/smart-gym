from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.core.database import SessionLocal
from app.services.auth_service import ensure_default_admin
from app.services.content_seed import seed_default_training_content


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not getattr(app.state, "skip_default_admin_seed", False):
        with SessionLocal() as db:
            ensure_default_admin(db)
            seed_default_training_content(db)
    yield


app = FastAPI(title="Smart Gym API", lifespan=lifespan)
app.include_router(api_router, prefix="/api")
