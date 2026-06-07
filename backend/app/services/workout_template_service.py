from __future__ import annotations

from typing import Optional

from sqlalchemy import delete, desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep
from app.schemas.workout_templates import (
    WorkoutTemplateCreate,
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
