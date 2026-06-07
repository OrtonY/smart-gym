from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.pose import (
    PoseAdviceResponse,
    PoseDetectionResultCreate,
    PoseDetectionResultResponse,
)
from app.services.ai_service import (
    AiCoachError,
    generate_pose_detection_advice,
    get_active_ai_provider_config,
)
from app.services.pose_service import (
    create_pose_detection_result,
    get_pose_detection_result,
    get_pose_result_exercise,
    list_pose_detection_results,
    save_pose_advice,
)

router = APIRouter()


@router.post(
    "/results",
    response_model=PoseDetectionResultResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_pose_detection_result(
    payload: PoseDetectionResultCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseDetectionResultResponse:
    try:
        return create_pose_detection_result(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/results", response_model=list[PoseDetectionResultResponse])
def list_my_pose_detection_results(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PoseDetectionResultResponse]:
    return list_pose_detection_results(db, current_user.id)


@router.get("/results/{result_id}", response_model=PoseDetectionResultResponse)
def get_my_pose_detection_result(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseDetectionResultResponse:
    result = get_pose_detection_result(db, current_user.id, result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pose detection result not found",
        )
    return result


@router.post("/results/{result_id}/ai-advice", response_model=PoseAdviceResponse)
def generate_my_pose_advice(
    result_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PoseAdviceResponse:
    result = get_pose_detection_result(db, current_user.id, result_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pose detection result not found",
        )
    config = get_active_ai_provider_config(db, current_user.id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI provider config not found",
        )

    try:
        advice = generate_pose_detection_advice(
            config,
            result,
            get_pose_result_exercise(db, result),
        )
    except AiCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return {"result": save_pose_advice(db, result, config, advice)}
