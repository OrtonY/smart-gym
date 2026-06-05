from fastapi import APIRouter

from app.api.routes import ai_configs, auth, health, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
