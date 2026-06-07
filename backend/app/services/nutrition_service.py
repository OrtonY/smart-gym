from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.storage import get_storage_path
from app.models.ai_provider_config import AiProviderConfig
from app.models.nutrition_log import NutritionLog
from app.schemas.nutrition import NutritionLogCorrection, NutritionLogCreate


ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
MAX_FOOD_IMAGE_BYTES = 6 * 1024 * 1024


def validate_food_image_bytes(image_bytes: bytes) -> None:
    if not image_bytes:
        raise ValueError("Food image is empty")
    if len(image_bytes) > MAX_FOOD_IMAGE_BYTES:
        raise ValueError("Food image must be 6MB or smaller")


def _extension_for_upload(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".heic"}:
        return suffix
    content_type_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
    }
    return content_type_map.get(upload.content_type or "", ".jpg")


def save_food_image(user_id: int, upload: UploadFile) -> str:
    if upload.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise ValueError("Unsupported food image type")
    current_position = upload.file.tell()
    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(current_position)
    if size == 0:
        raise ValueError("Food image is empty")
    if size > MAX_FOOD_IMAGE_BYTES:
        raise ValueError("Food image must be 6MB or smaller")

    relative_path = f"nutrition/{user_id}/{uuid4().hex}{_extension_for_upload(upload)}"
    target_path = get_storage_path(relative_path)
    with target_path.open("wb") as target_file:
        shutil.copyfileobj(upload.file, target_file)
    return relative_path


def create_nutrition_log(
    db: Session,
    user_id: int,
    payload: NutritionLogCreate,
    *,
    image_path: Optional[str] = None,
    ai_confidence: Optional[float] = None,
    config: Optional[AiProviderConfig] = None,
    ai_raw_json: Optional[dict[str, Any]] = None,
) -> NutritionLog:
    log = NutritionLog(
        user_id=user_id,
        image_path=image_path,
        ai_confidence=ai_confidence,
        ai_provider_type=config.provider_type if config is not None else None,
        ai_model_name=config.model_name if config is not None else None,
        ai_raw_json=ai_raw_json,
        **payload.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_nutrition_logs(db: Session, user_id: int) -> list[NutritionLog]:
    statement = (
        select(NutritionLog)
        .where(NutritionLog.user_id == user_id)
        .order_by(desc(NutritionLog.logged_at), desc(NutritionLog.id))
    )
    return list(db.execute(statement).scalars())


def get_nutrition_log(
    db: Session, user_id: int, log_id: int
) -> Optional[NutritionLog]:
    statement = select(NutritionLog).where(
        NutritionLog.id == log_id,
        NutritionLog.user_id == user_id,
    )
    return db.execute(statement).scalars().first()


def apply_nutrition_correction(
    db: Session, log: NutritionLog, payload: NutritionLogCorrection
) -> NutritionLog:
    updates: dict[str, Any] = payload.model_dump(exclude_unset=True)
    for field in [
        "food_name",
        "description",
        "calories_kcal",
        "protein_g",
        "carbs_g",
        "fat_g",
    ]:
        if field in updates:
            setattr(log, field, updates[field])
    log.user_correction = payload.user_correction
    log.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(log)
    return log
