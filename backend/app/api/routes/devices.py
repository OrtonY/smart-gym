from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.devices import (
    DeviceMetricResponse,
    HeartRateImportRequest,
    HeartRateImportResponse,
    HeartRateSummaryResponse,
)
from app.services.device_service import (
    get_heart_rate_summary,
    import_heart_rate_samples,
    list_device_metrics,
)

router = APIRouter()


@router.post(
    "/heart-rate/import",
    response_model=HeartRateImportResponse,
    status_code=status.HTTP_201_CREATED,
)
def import_my_heart_rate_samples(
    payload: HeartRateImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HeartRateImportResponse:
    try:
        metrics = import_heart_rate_samples(db, current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return {"metrics": metrics}


@router.get("/metrics", response_model=list[DeviceMetricResponse])
def list_my_device_metrics(
    metric_type: Optional[str] = Query(default=None, max_length=80),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DeviceMetricResponse]:
    return list_device_metrics(db, current_user.id, metric_type)


@router.get("/heart-rate/summary", response_model=HeartRateSummaryResponse)
def get_my_heart_rate_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HeartRateSummaryResponse:
    return get_heart_rate_summary(db, current_user.id)
