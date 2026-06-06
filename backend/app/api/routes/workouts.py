from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.workouts import (
    WorkoutSessionCreate,
    WorkoutSessionResponse,
    WorkoutSummaryResponse,
)
from app.services.workout_service import (
    create_workout_session,
    get_workout_summary,
    list_workout_sessions,
)

router = APIRouter()


@router.post(
    "/sessions",
    response_model=WorkoutSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_workout_session(
    payload: WorkoutSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSessionResponse:
    try:
        return create_workout_session(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/sessions", response_model=list[WorkoutSessionResponse])
def list_my_workout_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkoutSessionResponse]:
    return list_workout_sessions(db, current_user.id)


@router.get("/summary", response_model=WorkoutSummaryResponse)
def get_my_workout_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSummaryResponse:
    return get_workout_summary(db, current_user.id)
