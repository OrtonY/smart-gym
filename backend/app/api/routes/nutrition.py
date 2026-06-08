from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.nutrition import (
    FoodRecognitionResponse,
    NutritionLogCorrection,
    NutritionLogCreate,
    NutritionLogResponse,
)
from app.schemas.nutrition_plans import (
    NutritionPlanDetailResponse,
    NutritionPlanMealsReplace,
    NutritionPlanSummaryResponse,
    NutritionReconcileRequest,
    NutritionReconcileResponse,
    NutritionSummaryResponse,
)
from app.services.ai_service import (
    AiCoachError,
    generate_food_recognition,
    get_active_ai_provider_config,
)
from app.services.nutrition_service import (
    apply_nutrition_correction,
    create_nutrition_log,
    get_nutrition_log,
    list_nutrition_logs,
    save_food_image,
    validate_food_image_bytes,
)
from app.services.nutrition_plan_service import (
    get_nutrition_plan_detail,
    get_nutrition_summary,
    list_nutrition_plans,
    replace_nutrition_plan_meals,
)
from app.services.nutrition_reconciliation_service import reconcile_nutrition_calendar

router = APIRouter()


@router.post(
    "/logs",
    response_model=NutritionLogResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_nutrition_log(
    payload: NutritionLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionLogResponse:
    return create_nutrition_log(db, current_user.id, payload)


@router.get("/logs", response_model=list[NutritionLogResponse])
def list_my_nutrition_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NutritionLogResponse]:
    return list_nutrition_logs(db, current_user.id)


@router.get("/logs/{log_id}", response_model=NutritionLogResponse)
def get_my_nutrition_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionLogResponse:
    log = get_nutrition_log(db, current_user.id, log_id)
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition log not found",
        )
    return log


@router.put("/logs/{log_id}/correction", response_model=NutritionLogResponse)
def correct_my_nutrition_log(
    log_id: int,
    payload: NutritionLogCorrection,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionLogResponse:
    log = get_nutrition_log(db, current_user.id, log_id)
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition log not found",
        )
    return apply_nutrition_correction(db, log, payload)


@router.get("/plans", response_model=list[NutritionPlanSummaryResponse])
def list_my_nutrition_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NutritionPlanSummaryResponse]:
    return list_nutrition_plans(db, current_user.id)


@router.get("/plans/{plan_id}", response_model=NutritionPlanDetailResponse)
def get_my_nutrition_plan(
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionPlanDetailResponse:
    detail = get_nutrition_plan_detail(db, current_user.id, plan_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )
    return detail


@router.put("/plans/{plan_id}/meals", response_model=NutritionPlanDetailResponse)
def replace_my_nutrition_plan_meals(
    plan_id: int,
    payload: NutritionPlanMealsReplace,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionPlanDetailResponse:
    plan = replace_nutrition_plan_meals(db, current_user.id, plan_id, payload)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )
    detail = get_nutrition_plan_detail(db, current_user.id, plan.id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nutrition plan not found",
        )
    return detail


@router.get("/summary", response_model=NutritionSummaryResponse)
def get_my_nutrition_summary(
    days: int = 7,
    today: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionSummaryResponse:
    return get_nutrition_summary(db, current_user.id, today=today, days=days)


@router.post("/reconcile", response_model=NutritionReconcileResponse)
def reconcile_my_nutrition(
    payload: NutritionReconcileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionReconcileResponse:
    return reconcile_nutrition_calendar(db, current_user.id, today=payload.today)


@router.post(
    "/recognize",
    response_model=FoodRecognitionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def recognize_my_food(
    meal_type: str = Form("snack"),
    logged_at: Optional[datetime] = Form(None),
    description: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FoodRecognitionResponse:
    cleaned_description = (description or "").strip()
    if not cleaned_description and image is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Food description or image is required",
        )

    config = get_active_ai_provider_config(db, current_user.id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI provider config not found",
        )

    image_bytes: Optional[bytes] = None
    image_mime_type: Optional[str] = None
    if image is not None:
        image_bytes = await image.read()
        image_mime_type = image.content_type
        image.file.seek(0)
        try:
            validate_food_image_bytes(image_bytes)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    try:
        estimate = generate_food_recognition(
            config,
            cleaned_description,
            image_bytes=image_bytes,
            image_mime_type=image_mime_type,
        )
        payload = NutritionLogCreate(
            logged_at=logged_at or datetime.utcnow(),
            meal_type=meal_type,
            food_name=str(estimate["food_name"]),
            description=estimate.get("description") or cleaned_description or None,
            calories_kcal=int(estimate["calories_kcal"]),
            protein_g=estimate.get("protein_g"),
            carbs_g=estimate.get("carbs_g"),
            fat_g=estimate.get("fat_g"),
        )
        image_path = save_food_image(current_user.id, image) if image is not None else None
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except AiCoachError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    log = create_nutrition_log(
        db,
        current_user.id,
        payload,
        image_path=image_path,
        ai_confidence=estimate.get("confidence"),
        config=config,
        ai_raw_json=estimate,
    )
    return {"log": log}
