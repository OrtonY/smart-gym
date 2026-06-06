from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.content import ExerciseResponse, WorkoutModeResponse
from app.services.content_service import list_exercises, list_workout_modes

router = APIRouter()


@router.get("/workout-modes", response_model=list[WorkoutModeResponse])
def list_catalog_workout_modes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkoutModeResponse]:
    return list_workout_modes(db, active_only=True)


@router.get("/exercises", response_model=list[ExerciseResponse])
def list_catalog_exercises(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExerciseResponse]:
    return list_exercises(db, published_only=True)
