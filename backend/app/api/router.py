from fastapi import APIRouter

from app.api.routes import (
    admin_content,
    ai_configs,
    ai_coach,
    auth,
    catalog,
    health,
    leaderboard,
    training_plans,
    users,
    workouts,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin_content.router, prefix="/admin", tags=["admin"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(ai_coach.router, prefix="/ai-coach", tags=["ai-coach"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
api_router.include_router(
    training_plans.router, prefix="/training-plans", tags=["training-plans"]
)
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
