from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.workout_session import WorkoutSession
from app.models.workout_session_step import WorkoutSessionStep
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep
from app.schemas.workouts import WorkoutSessionFinish, WorkoutSessionStart
from app.services.workout_template_service import (
    get_workout_template,
    list_template_steps,
)


def _list_session_steps(db: Session, session_id: int) -> list[WorkoutSessionStep]:
    statement = (
        select(WorkoutSessionStep)
        .where(WorkoutSessionStep.workout_session_id == session_id)
        .order_by(WorkoutSessionStep.sort_order, WorkoutSessionStep.id)
    )
    return list(db.execute(statement).scalars())


def _session_response(
    db: Session, session: WorkoutSession, steps: Optional[list[WorkoutSessionStep]] = None
) -> dict[str, object]:
    session_steps = steps if steps is not None else _list_session_steps(db, session.id)
    return {
        "id": session.id,
        "user_id": session.user_id,
        "workout_mode_id": session.workout_mode_id,
        "exercise_id": session.exercise_id,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "duration_minutes": session.duration_minutes,
        "calories_burned": session.calories_burned,
        "reps": session.reps,
        "score": session.score,
        "status": session.status,
        "source_type": session.source_type,
        "source_plan_id": session.source_plan_id,
        "source_plan_item_id": session.source_plan_item_id,
        "source_template_id": session.source_template_id,
        "pose_detection_enabled": session.pose_detection_enabled,
        "completed_steps_count": session.completed_steps_count,
        "total_steps_count": session.total_steps_count,
        "notes": session.notes,
        "steps": session_steps,
    }


def _get_owned_plan_item(
    db: Session, user_id: int, plan_id: int, plan_item_id: int
) -> Optional[TrainingPlanItem]:
    statement = (
        select(TrainingPlanItem)
        .join(TrainingPlan, TrainingPlan.id == TrainingPlanItem.training_plan_id)
        .where(
            TrainingPlan.id == plan_id,
            TrainingPlan.user_id == user_id,
            TrainingPlanItem.id == plan_item_id,
            TrainingPlanItem.version_number == TrainingPlan.current_version,
        )
    )
    return db.execute(statement).scalars().first()


def _snapshot_from_plan_item(
    session_id: int, plan_item: TrainingPlanItem
) -> WorkoutSessionStep:
    return WorkoutSessionStep(
        workout_session_id=session_id,
        sort_order=plan_item.sort_order,
        exercise_id=plan_item.exercise_id,
        workout_mode_id=plan_item.workout_mode_id,
        title=plan_item.title,
        planned_sets=plan_item.sets,
        planned_reps=plan_item.reps,
        planned_duration_seconds=plan_item.duration_seconds
        or (plan_item.duration_minutes * 60 if plan_item.duration_minutes else None),
        planned_rest_seconds=plan_item.rest_seconds,
        status="planned",
    )


def _snapshot_from_template_step(
    session_id: int, step: WorkoutTemplateStep
) -> WorkoutSessionStep:
    return WorkoutSessionStep(
        workout_session_id=session_id,
        sort_order=step.sort_order,
        exercise_id=step.exercise_id,
        workout_mode_id=step.workout_mode_id,
        title=step.title,
        planned_sets=step.sets,
        planned_reps=step.reps,
        planned_duration_seconds=step.duration_seconds,
        planned_rest_seconds=step.rest_seconds,
        status="planned",
    )


def _first_snapshot_values(
    steps: list[WorkoutSessionStep],
) -> tuple[Optional[int], Optional[int]]:
    if not steps:
        return None, None
    return steps[0].workout_mode_id, steps[0].exercise_id


def start_workout_session(
    db: Session, user_id: int, payload: WorkoutSessionStart
) -> Optional[dict[str, object]]:
    source_plan_item: Optional[TrainingPlanItem] = None
    source_template: Optional[WorkoutTemplate] = None
    source_template_steps: list[WorkoutTemplateStep] = []

    if payload.source_type == "plan":
        if payload.source_plan_id is None or payload.source_plan_item_id is None:
            raise ValueError("Plan source requires plan and item")
        source_plan_item = _get_owned_plan_item(
            db,
            user_id,
            payload.source_plan_id,
            payload.source_plan_item_id,
        )
        if source_plan_item is None:
            return None
    elif payload.source_type == "template":
        if payload.source_template_id is None:
            raise ValueError("Template source requires template")
        source_template = get_workout_template(
            db, payload.source_template_id, published_only=True
        )
        if source_template is None:
            return None
        source_template_steps = list_template_steps(db, source_template.id)

    session = WorkoutSession(
        user_id=user_id,
        started_at=datetime.utcnow(),
        duration_minutes=0,
        calories_burned=0,
        status="in_progress",
        source_type=payload.source_type,
        source_plan_id=payload.source_plan_id if payload.source_type == "plan" else None,
        source_plan_item_id=(
            payload.source_plan_item_id if payload.source_type == "plan" else None
        ),
        source_template_id=(
            payload.source_template_id if payload.source_type == "template" else None
        ),
        pose_detection_enabled=payload.pose_detection_enabled,
    )
    db.add(session)
    db.flush()

    steps: list[WorkoutSessionStep] = []
    if source_plan_item is not None:
        steps.append(_snapshot_from_plan_item(session.id, source_plan_item))
    elif source_template is not None:
        steps.extend(
            _snapshot_from_template_step(session.id, step)
            for step in source_template_steps
        )

    workout_mode_id, exercise_id = _first_snapshot_values(steps)
    session.workout_mode_id = workout_mode_id
    session.exercise_id = exercise_id
    session.total_steps_count = len(steps)
    db.add_all(steps)
    db.commit()
    db.refresh(session)
    return _session_response(db, session, _list_session_steps(db, session.id))


def _get_owned_session(
    db: Session, user_id: int, session_id: int
) -> Optional[WorkoutSession]:
    statement = select(WorkoutSession).where(
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == user_id,
    )
    return db.execute(statement).scalars().first()


def _update_plan_item_from_session(
    db: Session, session: WorkoutSession, payload: WorkoutSessionFinish
) -> None:
    if session.source_plan_item_id is None:
        return
    plan_item = db.get(TrainingPlanItem, session.source_plan_item_id)
    if plan_item is None:
        return
    plan_item.linked_workout_session_id = session.id
    plan_item.completed_at = payload.ended_at
    plan_item.actual_duration_seconds = payload.duration_minutes * 60
    plan_item.actual_score = session.score
    if payload.status == "completed":
        plan_item.status = "completed"
    elif payload.status == "partial" or session.completed_steps_count > 0:
        plan_item.status = "partial"
    elif payload.status == "abandoned":
        plan_item.status = "partial"


def finish_workout_session(
    db: Session, user_id: int, session_id: int, payload: WorkoutSessionFinish
) -> Optional[dict[str, object]]:
    session = _get_owned_session(db, user_id, session_id)
    if session is None:
        return None

    existing_steps = {
        step.sort_order: step for step in _list_session_steps(db, session.id)
    }
    if payload.steps:
        for step_payload in payload.steps:
            step = existing_steps.get(step_payload.sort_order)
            if step is None:
                step = WorkoutSessionStep(
                    workout_session_id=session.id,
                    sort_order=step_payload.sort_order,
                    title=step_payload.title,
                )
                db.add(step)
            step.title = step_payload.title
            step.actual_reps = step_payload.actual_reps
            step.actual_duration_seconds = step_payload.actual_duration_seconds
            step.score = step_payload.score
            step.status = step_payload.status
            step.pose_detection_result_id = step_payload.pose_detection_result_id
            step.notes = step_payload.notes
    else:
        db.execute(
            delete(WorkoutSessionStep).where(
                WorkoutSessionStep.workout_session_id == session.id
            )
        )

    session.ended_at = payload.ended_at
    session.duration_minutes = payload.duration_minutes
    session.calories_burned = payload.calories_burned
    session.reps = payload.reps
    session.status = payload.status
    session.notes = payload.notes

    db.flush()
    steps = _list_session_steps(db, session.id)
    session.total_steps_count = len(steps)
    session.completed_steps_count = sum(
        1 for step in steps if step.status == "completed"
    )
    scored_steps = [step.score for step in steps if step.score is not None]
    if payload.score is not None:
        session.score = payload.score
    elif scored_steps:
        session.score = round(sum(scored_steps) / len(scored_steps), 2)
    else:
        session.score = None

    _update_plan_item_from_session(db, session, payload)
    db.commit()
    db.refresh(session)
    return _session_response(db, session, _list_session_steps(db, session.id))
