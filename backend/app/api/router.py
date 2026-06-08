from fastapi import APIRouter

from app.api.routes import (
    admin_content,
    ai_conversations,
    ai_configs,
    ai_coach,
    auth,
    catalog,
    devices,
    health,
    leaderboard,
    nutrition,
    pose,
    today,
    training_plans,
    users,
    workout_templates,
    workouts,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin_content.router, prefix="/admin", tags=["admin"])
api_router.include_router(ai_configs.router, prefix="/ai-configs", tags=["ai-configs"])
api_router.include_router(ai_coach.router, prefix="/ai-coach", tags=["ai-coach"])
api_router.include_router(
    ai_conversations.router,
    prefix="/ai-conversations",
    tags=["ai-conversations"],
)
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
api_router.include_router(nutrition.router, prefix="/nutrition", tags=["nutrition"])
api_router.include_router(pose.router, prefix="/pose", tags=["pose"])
api_router.include_router(today.router, prefix="/today", tags=["today"])
api_router.include_router(
    training_plans.router, prefix="/training-plans", tags=["training-plans"]
)
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(
    workout_templates.router, prefix="/workout-templates", tags=["workout-templates"]
)
api_router.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
