from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.user_profile import UserProfile
from app.models.workout_template import WorkoutTemplate
from app.services.workout_template_service import (
    list_template_steps,
    list_workout_templates,
)


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


def _duration_minutes_from_seconds(seconds: Optional[int]) -> int:
    if not seconds:
        return 0
    return max(1, round(seconds / 60))


def _plan_item_to_step(item: TrainingPlanItem) -> dict[str, object]:
    return {
        "id": item.id,
        "sort_order": item.sort_order,
        "exercise_id": item.exercise_id,
        "workout_mode_id": item.workout_mode_id,
        "title": item.title,
        "sets": item.sets,
        "reps": item.reps,
        "duration_seconds": item.duration_seconds
        or (item.duration_minutes * 60 if item.duration_minutes else None),
        "rest_seconds": item.rest_seconds,
        "instruction": item.instruction or item.notes,
        "allow_pose_detection": item.exercise_id is not None,
    }


def _template_step_to_step(step) -> dict[str, object]:
    return {
        "id": step.id,
        "sort_order": step.sort_order,
        "exercise_id": step.exercise_id,
        "workout_mode_id": step.workout_mode_id,
        "title": step.title,
        "sets": step.sets,
        "reps": step.reps,
        "duration_seconds": step.duration_seconds,
        "rest_seconds": step.rest_seconds,
        "instruction": step.instruction,
        "allow_pose_detection": step.allow_pose_detection,
    }


def get_today_training(
    db: Session, user_id: int, target_date: Optional[date] = None
) -> dict[str, object]:
    effective_date = target_date or _user_today(db, user_id)
    statement = (
        select(TrainingPlan, TrainingPlanItem)
        .join(TrainingPlanItem, TrainingPlanItem.training_plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.is_active.is_(True),
            TrainingPlanItem.version_number == TrainingPlan.current_version,
            TrainingPlanItem.scheduled_date == effective_date,
            TrainingPlanItem.entry_type == "scheduled",
            TrainingPlanItem.status.in_(["planned", "partial"]),
        )
        .order_by(TrainingPlanItem.sort_order, TrainingPlanItem.id)
    )
    rows = list(db.execute(statement).all())
    if rows:
        plan = rows[0][0]
        items = [row[1] for row in rows]
        steps = [_plan_item_to_step(item) for item in items]
        total_seconds = sum(
            step["duration_seconds"] or 0 for step in steps if isinstance(step, dict)
        )
        return {
            "source_type": "plan",
            "source_id": plan.id,
            "title": items[0].title if len(items) == 1 else "今日训练",
            "description": plan.title,
            "estimated_duration_minutes": _duration_minutes_from_seconds(total_seconds),
            "difficulty": None,
            "target_muscles": None,
            "steps": steps,
            "pose_detection_available": any(
                bool(step["allow_pose_detection"]) for step in steps
            ),
            "empty_state": None,
        }

    templates = list_workout_templates(db, published_only=True)
    template: Optional[WorkoutTemplate] = templates[0] if templates else None
    if template is not None:
        steps = [_template_step_to_step(step) for step in list_template_steps(db, template.id)]
        return {
            "source_type": "template",
            "source_id": template.id,
            "title": template.title,
            "description": template.description,
            "estimated_duration_minutes": template.estimated_duration_minutes,
            "difficulty": template.difficulty,
            "target_muscles": template.target_muscles,
            "steps": steps,
            "pose_detection_available": any(
                bool(step["allow_pose_detection"]) for step in steps
            ),
            "empty_state": None,
        }

    return {
        "source_type": "empty",
        "source_id": None,
        "title": "暂无训练内容",
        "description": None,
        "estimated_duration_minutes": None,
        "difficulty": None,
        "target_muscles": None,
        "steps": [],
        "pose_detection_available": False,
        "empty_state": "no_training_content",
    }
