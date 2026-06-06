from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.training_plans import (
    TrainingPlanCreate,
    TrainingPlanDetailResponse,
    TrainingPlanItemsReplace,
    TrainingPlanSummaryResponse,
    TrainingPlanVersionResponse,
)
from app.services.training_plan_service import (
    create_training_plan,
    get_training_plan_detail,
    list_training_plan_versions,
    list_training_plans,
    replace_training_plan_items,
)

router = APIRouter()


@router.get("", response_model=list[TrainingPlanSummaryResponse])
def list_my_training_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TrainingPlanSummaryResponse]:
    return list_training_plans(db, current_user.id)


@router.post(
    "",
    response_model=TrainingPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_training_plan(
    payload: TrainingPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingPlanDetailResponse:
    try:
        plan = create_training_plan(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    detail = get_training_plan_detail(db, current_user.id, plan.id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return detail


@router.get("/{plan_id}", response_model=TrainingPlanDetailResponse)
def get_my_training_plan(
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingPlanDetailResponse:
    detail = get_training_plan_detail(db, current_user.id, plan_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return detail


@router.put("/{plan_id}/items", response_model=TrainingPlanDetailResponse)
def replace_my_training_plan_items(
    plan_id: int,
    payload: TrainingPlanItemsReplace,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrainingPlanDetailResponse:
    try:
        plan = replace_training_plan_items(db, current_user.id, plan_id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )

    detail = get_training_plan_detail(db, current_user.id, plan.id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return detail


@router.get("/{plan_id}/versions", response_model=list[TrainingPlanVersionResponse])
def list_my_training_plan_versions(
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TrainingPlanVersionResponse]:
    versions = list_training_plan_versions(db, current_user.id, plan_id)
    if versions is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )
    return versions
