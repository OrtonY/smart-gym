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
from app.schemas.workout_templates import (
    WorkoutTemplateCreate,
    WorkoutTemplateResponse,
    WorkoutTemplateUpdate,
)
from app.services.content_service import (
    create_exercise,
    create_workout_mode,
    list_exercises,
    list_workout_modes,
    update_exercise,
    update_workout_mode,
)
from app.services.workout_template_service import (
    create_workout_template,
    get_workout_template,
    list_workout_templates,
    serialize_template,
    update_workout_template,
)

router = APIRouter()


@router.get("/workout-modes", response_model=list[WorkoutModeResponse])
def list_admin_workout_modes(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[WorkoutModeResponse]:
    return list_workout_modes(db, active_only=False)


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
    try:
        return create_workout_mode(db, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


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


@router.get("/exercises", response_model=list[ExerciseResponse])
def list_admin_exercises(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ExerciseResponse]:
    return list_exercises(db, published_only=False)


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
    try:
        return create_exercise(db, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


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


@router.get("/workout-templates", response_model=list[WorkoutTemplateResponse])
def list_admin_workout_templates(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    templates = list_workout_templates(db, published_only=False)
    return [serialize_template(db, template) for template in templates]


@router.post(
    "/workout-templates",
    response_model=WorkoutTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_admin_workout_template(
    payload: WorkoutTemplateCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        template = create_workout_template(db, payload)
    except ValueError as exc:
        message = str(exc)
        status_code = (
            status.HTTP_409_CONFLICT
            if "already exists" in message
            else status.HTTP_404_NOT_FOUND
        )
        raise HTTPException(status_code=status_code, detail=message) from exc
    return serialize_template(db, template)


@router.put("/workout-templates/{template_id}", response_model=WorkoutTemplateResponse)
def update_admin_workout_template(
    template_id: int,
    payload: WorkoutTemplateUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        template = update_workout_template(db, template_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout template not found",
        )
    return serialize_template(db, template)
