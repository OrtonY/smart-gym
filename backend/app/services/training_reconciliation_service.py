from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.models.workout_session_step import WorkoutSessionStep
from app.models.workout_template import WorkoutTemplate


def _user_today(db: Session, user_id: int) -> date:
    profile = (
        db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        .scalars()
        .first()
    )
    timezone_name = profile.timezone if profile else "Asia/Shanghai"
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo("Asia/Shanghai")
    return datetime.now(timezone).date()


def _active_plans(db: Session, user_id: int) -> list[TrainingPlan]:
    statement = (
        select(TrainingPlan)
        .where(TrainingPlan.user_id == user_id, TrainingPlan.is_active.is_(True))
        .order_by(desc(TrainingPlan.updated_at), desc(TrainingPlan.id))
    )
    return list(db.execute(statement).scalars())


def _find_or_create_record_plan(db: Session, user_id: int) -> TrainingPlan:
    plans = _active_plans(db, user_id)
    if plans:
        return plans[0]

    plan = TrainingPlan(
        user_id=user_id,
        title="训练记录",
        source="reconciliation",
        current_version=1,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    db.add(
        TrainingPlanVersion(
            training_plan_id=plan.id,
            version_number=1,
            source="reconciliation",
            change_summary="创建训练记录日历",
        )
    )
    return plan


def _mark_missed_items_skipped(
    db: Session, user_id: int, cutoff_date: date
) -> int:
    count = 0
    statement = (
        select(TrainingPlanItem)
        .join(TrainingPlan, TrainingPlan.id == TrainingPlanItem.training_plan_id)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.is_active.is_(True),
            TrainingPlanItem.version_number == TrainingPlan.current_version,
            TrainingPlanItem.entry_type == "scheduled",
            TrainingPlanItem.status == "planned",
            TrainingPlanItem.scheduled_date.is_not(None),
            TrainingPlanItem.scheduled_date <= cutoff_date,
        )
    )
    for item in db.execute(statement).scalars():
        item.status = "skipped"
        count += 1
    return count


def _session_date(session: WorkoutSession) -> Optional[date]:
    value = session.ended_at or session.started_at
    return value.date() if value else None


def _linked_session_ids(db: Session, user_id: int) -> set[int]:
    statement = (
        select(TrainingPlanItem.linked_workout_session_id)
        .join(TrainingPlan, TrainingPlan.id == TrainingPlanItem.training_plan_id)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlanItem.linked_workout_session_id.is_not(None),
        )
    )
    return {int(value) for value in db.execute(statement).scalars() if value is not None}


def _first_session_step(db: Session, session_id: int) -> Optional[WorkoutSessionStep]:
    statement = (
        select(WorkoutSessionStep)
        .where(WorkoutSessionStep.workout_session_id == session_id)
        .order_by(WorkoutSessionStep.sort_order, WorkoutSessionStep.id)
    )
    return db.execute(statement).scalars().first()


def _session_title(db: Session, session: WorkoutSession) -> str:
    if session.source_template_id is not None:
        template = db.get(WorkoutTemplate, session.source_template_id)
        if template is not None:
            return template.title
    first_step = _first_session_step(db, session.id)
    if first_step is not None:
        return first_step.title
    return "临时训练"


def _next_sort_order(db: Session, plan: TrainingPlan, scheduled_date: date) -> int:
    statement = select(TrainingPlanItem.sort_order).where(
        TrainingPlanItem.training_plan_id == plan.id,
        TrainingPlanItem.version_number == plan.current_version,
        TrainingPlanItem.scheduled_date == scheduled_date,
    )
    values = [value for value in db.execute(statement).scalars()]
    return max(values, default=-1) + 1


def _create_ad_hoc_entries(db: Session, user_id: int, cutoff_date: date) -> int:
    linked_ids = _linked_session_ids(db, user_id)
    statement = (
        select(WorkoutSession)
        .where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.status == "completed",
            WorkoutSession.source_type.in_(["template", "free"]),
        )
        .order_by(WorkoutSession.ended_at, WorkoutSession.id)
    )
    sessions = list(db.execute(statement).scalars())
    created = 0
    plan: Optional[TrainingPlan] = None
    for session in sessions:
        if session.id in linked_ids:
            continue
        scheduled_date = _session_date(session)
        if scheduled_date is None or scheduled_date > cutoff_date:
            continue
        if plan is None:
            plan = _find_or_create_record_plan(db, user_id)
        item = TrainingPlanItem(
            training_plan_id=plan.id,
            version_number=plan.current_version,
            scheduled_date=scheduled_date,
            day_of_week=scheduled_date.isoweekday(),
            sort_order=_next_sort_order(db, plan, scheduled_date),
            exercise_id=session.exercise_id,
            workout_mode_id=session.workout_mode_id,
            title=_session_title(db, session),
            duration_minutes=session.duration_minutes,
            duration_seconds=session.duration_minutes * 60,
            source_template_id=session.source_template_id,
            entry_type="ad_hoc",
            status="completed",
            linked_workout_session_id=session.id,
            completed_at=session.ended_at,
            actual_duration_seconds=session.duration_minutes * 60,
            actual_score=session.score,
            notes=session.notes,
        )
        db.add(item)
        linked_ids.add(session.id)
        created += 1
    return created


def reconcile_training_plan_calendar(
    db: Session, user_id: int, today: Optional[date] = None
) -> dict[str, object]:
    effective_today = today or _user_today(db, user_id)
    cutoff_date = effective_today - timedelta(days=1)
    skipped_items = _mark_missed_items_skipped(db, user_id, cutoff_date)
    ad_hoc_entries_created = _create_ad_hoc_entries(db, user_id, cutoff_date)
    db.commit()
    return {
        "skipped_items": skipped_items,
        "ad_hoc_entries_created": ad_hoc_entries_created,
        "reconciled_date": cutoff_date,
    }
