from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.training_plans import TrainingPlanDetailResponse
from app.schemas.workout_templates import (
    WorkoutTemplateApplyToPlan,
    WorkoutTemplateResponse,
)
from app.services.workout_template_service import (
    apply_template_to_plan,
    get_workout_template,
    list_workout_templates,
    serialize_template,
)
from app.services.training_plan_service import get_training_plan_detail

router = APIRouter()


@router.get("", response_model=list[WorkoutTemplateResponse])
def list_user_workout_templates(
    goal: Optional[str] = None,
    difficulty: Optional[str] = None,
    target: Optional[str] = None,
    max_duration: Optional[int] = Query(default=None, ge=1, le=1440),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    templates = list_workout_templates(
        db,
        published_only=True,
        goal=goal,
        difficulty=difficulty,
        target=target,
        max_duration=max_duration,
    )
    return [serialize_template(db, template) for template in templates]


@router.get("/{template_id}", response_model=WorkoutTemplateResponse)
def get_user_workout_template(
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    template = get_workout_template(db, template_id, published_only=True)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout template not found",
        )
    return serialize_template(db, template)


@router.post(
    "/{template_id}/apply-to-plan",
    response_model=TrainingPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def apply_user_workout_template_to_plan(
    template_id: int,
    payload: WorkoutTemplateApplyToPlan,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    plan = apply_template_to_plan(db, current_user.id, template_id, payload)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout template not found",
        )
    detail = get_training_plan_detail(db, current_user.id, plan.id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return detail
