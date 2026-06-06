from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.content import (
    ExerciseCreate,
    ExerciseResponse,
    ExerciseUpdate,
    WorkoutModeCreate,
    WorkoutModeResponse,
    WorkoutModeUpdate,
)
from app.services.content_service import (
    create_exercise,
    create_workout_mode,
    update_exercise,
    update_workout_mode,
)

router = APIRouter()


@router.post(
    "/workout-modes",
    response_model=WorkoutModeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_workout_mode(
    payload: WorkoutModeCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WorkoutModeResponse:
    return create_workout_mode(db, payload)


@router.put("/workout-modes/{workout_mode_id}", response_model=WorkoutModeResponse)
def update_admin_workout_mode(
    workout_mode_id: int,
    payload: WorkoutModeUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> WorkoutModeResponse:
    workout_mode = update_workout_mode(db, workout_mode_id, payload)
    if workout_mode is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout mode not found",
        )
    return workout_mode


@router.post(
    "/exercises",
    response_model=ExerciseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_exercise(
    payload: ExerciseCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ExerciseResponse:
    return create_exercise(db, payload)


@router.put("/exercises/{exercise_id}", response_model=ExerciseResponse)
def update_admin_exercise(
    exercise_id: int,
    payload: ExerciseUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ExerciseResponse:
    exercise = update_exercise(db, exercise_id, payload)
    if exercise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found",
        )
    return exercise
