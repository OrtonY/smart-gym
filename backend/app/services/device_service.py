from __future__ import annotations

from typing import Optional

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models.device_metric import DeviceMetric
from app.models.workout_session import WorkoutSession
from app.schemas.devices import HeartRateImportRequest


def import_heart_rate_samples(
    db: Session, user_id: int, payload: HeartRateImportRequest
) -> list[DeviceMetric]:
    if payload.workout_session_id is not None:
        workout_session = db.get(WorkoutSession, payload.workout_session_id)
        if workout_session is None or workout_session.user_id != user_id:
            raise ValueError("Workout session not found")

    metrics = [
        DeviceMetric(
            user_id=user_id,
            source=payload.source,
            metric_type="heart_rate",
            measured_at=sample.measured_at,
            value=float(sample.bpm),
            unit="bpm",
            workout_session_id=payload.workout_session_id,
            raw_json={"bpm": sample.bpm, "source": payload.source},
        )
        for sample in payload.samples
    ]
    db.add_all(metrics)
    db.commit()
    for metric in metrics:
        db.refresh(metric)
    return metrics


def list_device_metrics(
    db: Session, user_id: int, metric_type: Optional[str] = None
) -> list[DeviceMetric]:
    statement = select(DeviceMetric).where(DeviceMetric.user_id == user_id)
    if metric_type is not None:
        statement = statement.where(DeviceMetric.metric_type == metric_type)
    statement = statement.order_by(desc(DeviceMetric.measured_at), desc(DeviceMetric.id))
    return list(db.execute(statement).scalars())


def get_heart_rate_summary(db: Session, user_id: int) -> dict[str, Optional[int]]:
    aggregate_statement = select(
        func.count(DeviceMetric.id),
        func.avg(DeviceMetric.value),
        func.max(DeviceMetric.value),
    ).where(
        DeviceMetric.user_id == user_id,
        DeviceMetric.metric_type == "heart_rate",
    )
    samples_count, average_bpm, max_bpm = db.execute(aggregate_statement).one()
    latest = (
        db.execute(
            select(DeviceMetric.value)
            .where(
                DeviceMetric.user_id == user_id,
                DeviceMetric.metric_type == "heart_rate",
            )
            .order_by(desc(DeviceMetric.measured_at), desc(DeviceMetric.id))
        )
        .scalars()
        .first()
    )
    return {
        "samples_count": int(samples_count),
        "latest_bpm": int(round(latest)) if latest is not None else None,
        "average_bpm": int(round(average_bpm)) if average_bpm is not None else None,
        "max_bpm": int(round(max_bpm)) if max_bpm is not None else None,
    }
