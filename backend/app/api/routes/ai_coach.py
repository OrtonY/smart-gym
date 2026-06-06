from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.ai_coach import (
    AdjustTrainingPlanRequest,
    AiTrainingPlanResponse,
    GenerateTrainingPlanRequest,
)
from app.services.ai_service import (
    AiCoachError,
    adjust_ai_training_plan,
    generate_ai_training_plan,
)

router = APIRouter()


@router.post(
    "/training-plans/generate",
    response_model=AiTrainingPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_my_training_plan(
    payload: GenerateTrainingPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiTrainingPlanResponse:
    try:
        return generate_ai_training_plan(db, current_user.id, payload)
    except AiCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/training-plans/{plan_id}/adjust",
    response_model=AiTrainingPlanResponse,
)
def adjust_my_training_plan(
    plan_id: int,
    payload: AdjustTrainingPlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiTrainingPlanResponse:
    try:
        result = adjust_ai_training_plan(db, current_user.id, plan_id, payload)
    except AiCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return result
