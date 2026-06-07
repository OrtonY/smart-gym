from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class HeartRateSample(BaseModel):
    measured_at: datetime
    bpm: int = Field(ge=30, le=240)

    model_config = ConfigDict(extra="forbid")


class HeartRateImportRequest(BaseModel):
    source: str = Field(default="simulated", min_length=1, max_length=80)
    workout_session_id: Optional[int] = Field(default=None, ge=1)
    samples: list[HeartRateSample] = Field(min_length=1, max_length=1_000)

    model_config = ConfigDict(extra="forbid")


class DeviceMetricResponse(BaseModel):
    id: int
    user_id: int
    source: str
    metric_type: str
    measured_at: datetime
    value: float
    unit: str
    workout_session_id: Optional[int] = None
    raw_json: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HeartRateImportResponse(BaseModel):
    metrics: list[DeviceMetricResponse]


class HeartRateSummaryResponse(BaseModel):
    samples_count: int
    latest_bpm: Optional[int] = None
    average_bpm: Optional[int] = None
    max_bpm: Optional[int] = None
