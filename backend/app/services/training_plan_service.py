from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion
from app.models.workout_mode import WorkoutMode
from app.schemas.training_plans import (
    TrainingPlanCreate,
    TrainingPlanItemCreate,
    TrainingPlanItemsReplace,
)


def _get_owned_training_plan(
    db: Session, user_id: int, plan_id: int
) -> Optional[TrainingPlan]:
    return (
        db.execute(
            select(TrainingPlan).where(
                TrainingPlan.id == plan_id,
                TrainingPlan.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )


def _validate_training_plan_items(
    db: Session, items: list[TrainingPlanItemCreate]
) -> None:
    for item in items:
        if item.exercise_id is not None:
            exercise = db.get(Exercise, item.exercise_id)
            if exercise is None or not exercise.is_published:
                raise ValueError("Exercise not found")

        if item.workout_mode_id is not None:
            workout_mode = db.get(WorkoutMode, item.workout_mode_id)
            if workout_mode is None or not workout_mode.is_active:
                raise ValueError("Workout mode not found")


def _create_version(
    db: Session,
    plan_id: int,
    version_number: int,
    source: str,
    change_summary: Optional[str],
) -> TrainingPlanVersion:
    version = TrainingPlanVersion(
        training_plan_id=plan_id,
        version_number=version_number,
        source=source,
        change_summary=change_summary,
    )
    db.add(version)
    return version


def _create_items(
    db: Session,
    plan_id: int,
    version_number: int,
    items: list[TrainingPlanItemCreate],
) -> list[TrainingPlanItem]:
    created_items = [
        TrainingPlanItem(
            training_plan_id=plan_id,
            version_number=version_number,
            **item.model_dump(),
        )
        for item in items
    ]
    db.add_all(created_items)
    return created_items


def create_training_plan(
    db: Session,
    user_id: int,
    payload: TrainingPlanCreate,
    source: str = "manual",
) -> TrainingPlan:
    _validate_training_plan_items(db, payload.items)

    plan = TrainingPlan(
        user_id=user_id,
        title=payload.title,
        source=source,
        current_version=1,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    _create_version(db, plan.id, 1, source, payload.change_summary)
    _create_items(db, plan.id, 1, payload.items)
    db.commit()
    db.refresh(plan)
    return plan


def list_training_plans(db: Session, user_id: int) -> list[TrainingPlan]:
    statement = (
        select(TrainingPlan)
        .where(TrainingPlan.user_id == user_id)
        .order_by(desc(TrainingPlan.updated_at), desc(TrainingPlan.id))
    )
    return list(db.execute(statement).scalars())


def list_training_plan_versions(
    db: Session, user_id: int, plan_id: int
) -> Optional[list[TrainingPlanVersion]]:
    plan = _get_owned_training_plan(db, user_id, plan_id)
    if plan is None:
        return None

    statement = (
        select(TrainingPlanVersion)
        .where(TrainingPlanVersion.training_plan_id == plan.id)
        .order_by(desc(TrainingPlanVersion.version_number))
    )
    return list(db.execute(statement).scalars())


def list_training_plan_items(
    db: Session,
    user_id: int,
    plan_id: int,
    version_number: Optional[int] = None,
) -> Optional[list[TrainingPlanItem]]:
    plan = _get_owned_training_plan(db, user_id, plan_id)
    if plan is None:
        return None

    effective_version = version_number or plan.current_version
    statement = (
        select(TrainingPlanItem)
        .where(
            TrainingPlanItem.training_plan_id == plan.id,
            TrainingPlanItem.version_number == effective_version,
        )
        .order_by(TrainingPlanItem.day_of_week, TrainingPlanItem.sort_order)
    )
    return list(db.execute(statement).scalars())


def get_training_plan_detail(
    db: Session, user_id: int, plan_id: int
) -> Optional[dict[str, object]]:
    plan = _get_owned_training_plan(db, user_id, plan_id)
    if plan is None:
        return None

    items = list_training_plan_items(db, user_id, plan_id) or []
    versions = list_training_plan_versions(db, user_id, plan_id) or []
    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "title": plan.title,
        "source": plan.source,
        "current_version": plan.current_version,
        "is_active": plan.is_active,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "items": items,
        "versions": versions,
    }


def replace_training_plan_items(
    db: Session,
    user_id: int,
    plan_id: int,
    payload: TrainingPlanItemsReplace,
    source: str = "manual",
) -> Optional[TrainingPlan]:
    plan = _get_owned_training_plan(db, user_id, plan_id)
    if plan is None:
        return None

    _validate_training_plan_items(db, payload.items)

    next_version = plan.current_version + 1
    plan.current_version = next_version
    plan.updated_at = datetime.utcnow()
    _create_version(db, plan.id, next_version, source, payload.change_summary)
    _create_items(db, plan.id, next_version, payload.items)
    db.commit()
    db.refresh(plan)
    return plan
