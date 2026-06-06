from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.user import User
from app.schemas.leaderboard import (
    LeaderboardEntryResponse,
    LeaderboardRefreshRequest,
)
from app.services.leaderboard_service import list_leaderboard, refresh_leaderboard

router = APIRouter()


@router.post("/refresh", response_model=list[LeaderboardEntryResponse])
def refresh_public_leaderboard(
    payload: LeaderboardRefreshRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[LeaderboardEntryResponse]:
    return refresh_leaderboard(
        db,
        period_type=payload.period_type,
        metric_type=payload.metric_type,
        anchor_date=payload.anchor_date,
    )


@router.get("", response_model=list[LeaderboardEntryResponse])
def list_public_leaderboard(
    period_type: str = Query(pattern="^(weekly|monthly)$"),
    metric_type: str = Query(
        pattern="^(duration_minutes|calories_burned|sessions_count)$"
    ),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LeaderboardEntryResponse]:
    return list_leaderboard(db, period_type=period_type, metric_type=metric_type)
