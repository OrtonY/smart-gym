from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import delete, desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion
from app.models.workout_mode import WorkoutMode
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep
from app.schemas.workout_templates import (
    WorkoutTemplateCreate,
    WorkoutTemplateApplyToPlan,
    WorkoutTemplateStepCreate,
    WorkoutTemplateUpdate,
)


def _validate_steps(
    db: Session, steps: list[WorkoutTemplateStepCreate], require_published: bool
) -> None:
    for step in steps:
        if step.exercise_id is not None:
            exercise = db.get(Exercise, step.exercise_id)
            if exercise is None or (require_published and not exercise.is_published):
                raise ValueError("Exercise not found")
        if step.workout_mode_id is not None:
            workout_mode = db.get(WorkoutMode, step.workout_mode_id)
            if workout_mode is None or not workout_mode.is_active:
                raise ValueError("Workout mode not found")


def _create_steps(
    db: Session, template_id: int, steps: list[WorkoutTemplateStepCreate]
) -> list[WorkoutTemplateStep]:
    created_steps = [
        WorkoutTemplateStep(workout_template_id=template_id, **step.model_dump())
        for step in steps
    ]
    db.add_all(created_steps)
    return created_steps


def list_template_steps(db: Session, template_id: int) -> list[WorkoutTemplateStep]:
    statement = (
        select(WorkoutTemplateStep)
        .where(WorkoutTemplateStep.workout_template_id == template_id)
        .order_by(WorkoutTemplateStep.sort_order, WorkoutTemplateStep.id)
    )
    return list(db.execute(statement).scalars())


def serialize_template(
    db: Session, template: WorkoutTemplate
) -> dict[str, object]:
    return {
        "id": template.id,
        "slug": template.slug,
        "title": template.title,
        "description": template.description,
        "goal": template.goal,
        "difficulty": template.difficulty,
        "target_muscles": template.target_muscles,
        "estimated_duration_minutes": template.estimated_duration_minutes,
        "cover_url": template.cover_url,
        "tags": template.tags,
        "recommendation_weight": template.recommendation_weight,
        "is_published": template.is_published,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
        "steps": list_template_steps(db, template.id),
    }


def list_workout_templates(
    db: Session,
    published_only: bool = True,
    goal: Optional[str] = None,
    difficulty: Optional[str] = None,
    target: Optional[str] = None,
    max_duration: Optional[int] = None,
) -> list[WorkoutTemplate]:
    statement = select(WorkoutTemplate)
    if published_only:
        statement = statement.where(WorkoutTemplate.is_published.is_(True))
    if goal:
        statement = statement.where(WorkoutTemplate.goal == goal)
    if difficulty:
        statement = statement.where(WorkoutTemplate.difficulty == difficulty)
    if target:
        statement = statement.where(WorkoutTemplate.target_muscles.ilike(f"%{target}%"))
    if max_duration is not None:
        statement = statement.where(
            WorkoutTemplate.estimated_duration_minutes <= max_duration
        )
    statement = statement.order_by(
        desc(WorkoutTemplate.recommendation_weight),
        WorkoutTemplate.id,
    )
    return list(db.execute(statement).scalars())


def get_workout_template(
    db: Session, template_id: int, published_only: bool = True
) -> Optional[WorkoutTemplate]:
    statement = select(WorkoutTemplate).where(WorkoutTemplate.id == template_id)
    if published_only:
        statement = statement.where(WorkoutTemplate.is_published.is_(True))
    return db.execute(statement).scalars().first()


def create_workout_template(
    db: Session, payload: WorkoutTemplateCreate
) -> WorkoutTemplate:
    _validate_steps(db, payload.steps, require_published=payload.is_published)
    data = payload.model_dump(exclude={"steps"})
    template = WorkoutTemplate(**data)
    db.add(template)
    try:
        db.flush()
        _create_steps(db, template.id, payload.steps)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Workout template slug already exists") from exc
    db.refresh(template)
    return template


def update_workout_template(
    db: Session, template_id: int, payload: WorkoutTemplateUpdate
) -> Optional[WorkoutTemplate]:
    template = get_workout_template(db, template_id, published_only=False)
    if template is None:
        return None

    data = payload.model_dump(exclude_unset=True, exclude={"steps"})
    next_is_published = data.get("is_published", template.is_published)
    next_steps = payload.steps
    if next_steps is not None:
        _validate_steps(db, next_steps, require_published=next_is_published)

    for field, value in data.items():
        setattr(template, field, value)

    if next_steps is not None:
        db.execute(
            delete(WorkoutTemplateStep).where(
                WorkoutTemplateStep.workout_template_id == template.id
            )
        )
        _create_steps(db, template.id, next_steps)

    db.commit()
    db.refresh(template)
    return template


def _find_or_create_plan(
    db: Session, user_id: int, plan_title: str
) -> TrainingPlan:
    statement = (
        select(TrainingPlan)
        .where(
            TrainingPlan.user_id == user_id,
            TrainingPlan.title == plan_title,
            TrainingPlan.is_active.is_(True),
        )
        .order_by(desc(TrainingPlan.updated_at), desc(TrainingPlan.id))
    )
    plan = db.execute(statement).scalars().first()
    if plan is not None:
        return plan

    plan = TrainingPlan(
        user_id=user_id,
        title=plan_title,
        source="template",
        current_version=1,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    db.add(
        TrainingPlanVersion(
            training_plan_id=plan.id,
            version_number=1,
            source="template",
            change_summary="从训练模板创建课表",
        )
    )
    return plan


def _current_plan_items(db: Session, plan: TrainingPlan) -> list[TrainingPlanItem]:
    statement = (
        select(TrainingPlanItem)
        .where(
            TrainingPlanItem.training_plan_id == plan.id,
            TrainingPlanItem.version_number == plan.current_version,
        )
        .order_by(TrainingPlanItem.day_of_week, TrainingPlanItem.sort_order)
    )
    return list(db.execute(statement).scalars())


def _copy_existing_item(
    item: TrainingPlanItem, plan_id: int, version_number: int
) -> TrainingPlanItem:
    return TrainingPlanItem(
        training_plan_id=plan_id,
        version_number=version_number,
        scheduled_date=item.scheduled_date,
        day_of_week=item.day_of_week,
        sort_order=item.sort_order,
        exercise_id=item.exercise_id,
        workout_mode_id=item.workout_mode_id,
        title=item.title,
        sets=item.sets,
        reps=item.reps,
        duration_minutes=item.duration_minutes,
        duration_seconds=item.duration_seconds,
        rest_seconds=item.rest_seconds,
        instruction=item.instruction,
        source_template_id=item.source_template_id,
        source_template_step_id=item.source_template_step_id,
        entry_type=item.entry_type,
        status=item.status,
        notes=item.notes,
    )


def apply_template_to_plan(
    db: Session,
    user_id: int,
    template_id: int,
    payload: WorkoutTemplateApplyToPlan,
) -> Optional[TrainingPlan]:
    template = get_workout_template(db, template_id, published_only=True)
    if template is None:
        return None

    steps = list_template_steps(db, template.id)
    plan = _find_or_create_plan(db, user_id, payload.plan_title)
    is_new_plan = plan.current_version == 1 and not _current_plan_items(db, plan)
    next_version = plan.current_version if is_new_plan else plan.current_version + 1

    copied_items: list[TrainingPlanItem] = []
    if not is_new_plan:
        copied_items.extend(
            _copy_existing_item(item, plan.id, next_version)
            for item in _current_plan_items(db, plan)
        )
        plan.current_version = next_version
        plan.updated_at = datetime.utcnow()
        db.add(
            TrainingPlanVersion(
                training_plan_id=plan.id,
                version_number=next_version,
                source="template",
                change_summary=f"加入模板：{template.title}",
            )
        )

    existing_sort_orders = [
        item.sort_order
        for item in copied_items
        if item.scheduled_date == payload.scheduled_date
    ]
    next_sort_order = max(existing_sort_orders, default=-1) + 1
    for index, step in enumerate(steps):
        copied_items.append(
            TrainingPlanItem(
                training_plan_id=plan.id,
                version_number=next_version,
                scheduled_date=payload.scheduled_date,
                day_of_week=payload.scheduled_date.isoweekday(),
                sort_order=next_sort_order + index,
                exercise_id=step.exercise_id,
                workout_mode_id=step.workout_mode_id,
                title=step.title,
                sets=step.sets,
                reps=step.reps,
                duration_minutes=None,
                duration_seconds=step.duration_seconds,
                rest_seconds=step.rest_seconds,
                instruction=step.instruction,
                source_template_id=template.id,
                source_template_step_id=step.id,
                entry_type="scheduled",
                status="planned",
                notes=None,
            )
        )

    db.add_all(copied_items)
    db.commit()
    db.refresh(plan)
    return plan
