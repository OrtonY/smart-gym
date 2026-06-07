from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.workouts import (
    WorkoutSessionCreate,
    WorkoutSessionFinish,
    WorkoutSessionResponse,
    WorkoutSessionStart,
    WorkoutSessionStartResponse,
    WorkoutSummaryResponse,
)
from app.services.workout_session_service import (
    finish_workout_session,
    start_workout_session,
)
from app.services.workout_service import (
    create_workout_session,
    get_workout_summary,
    list_workout_sessions,
)

router = APIRouter()


@router.post(
    "/sessions/start",
    response_model=WorkoutSessionStartResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_my_workout_session(
    payload: WorkoutSessionStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSessionStartResponse:
    try:
        session = start_workout_session(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout source not found",
        )
    return session


@router.put(
    "/sessions/{session_id}/finish",
    response_model=WorkoutSessionStartResponse,
)
def finish_my_workout_session(
    session_id: int,
    payload: WorkoutSessionFinish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutSessionStartResponse:
    session = finish_workout_session(db, current_user.id, session_id, payload)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout session not found",
        )
    return session


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
