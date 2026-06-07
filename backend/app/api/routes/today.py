from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.today import TodayWorkoutResponse
from app.services.today_training_service import get_today_training

router = APIRouter()


@router.get("/training", response_model=TodayWorkoutResponse)
def get_user_today_training(
    date: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return get_today_training(db, current_user.id, target_date=date)
