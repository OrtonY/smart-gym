from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.schemas.content import (
    ExerciseCreate,
    ExerciseUpdate,
    WorkoutModeCreate,
    WorkoutModeUpdate,
)


def list_workout_modes(db: Session, active_only: bool = False) -> list[WorkoutMode]:
    statement = select(WorkoutMode).order_by(WorkoutMode.id)
    if active_only:
        statement = statement.where(WorkoutMode.is_active.is_(True))
    return list(db.execute(statement).scalars())


def create_workout_mode(db: Session, payload: WorkoutModeCreate) -> WorkoutMode:
    workout_mode = WorkoutMode(**payload.model_dump())
    db.add(workout_mode)
    db.commit()
    db.refresh(workout_mode)
    return workout_mode


def get_workout_mode(db: Session, workout_mode_id: int) -> Optional[WorkoutMode]:
    return db.get(WorkoutMode, workout_mode_id)


def update_workout_mode(
    db: Session, workout_mode_id: int, payload: WorkoutModeUpdate
) -> Optional[WorkoutMode]:
    workout_mode = get_workout_mode(db, workout_mode_id)
    if workout_mode is None:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout_mode, field, value)

    db.commit()
    db.refresh(workout_mode)
    return workout_mode


def list_exercises(db: Session, published_only: bool = False) -> list[Exercise]:
    statement = select(Exercise).order_by(Exercise.id)
    if published_only:
        statement = statement.where(Exercise.is_published.is_(True))
    return list(db.execute(statement).scalars())


def create_exercise(db: Session, payload: ExerciseCreate) -> Exercise:
    exercise = Exercise(**payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def get_exercise(db: Session, exercise_id: int) -> Optional[Exercise]:
    return db.get(Exercise, exercise_id)


def update_exercise(
    db: Session, exercise_id: int, payload: ExerciseUpdate
) -> Optional[Exercise]:
    exercise = get_exercise(db, exercise_id)
    if exercise is None:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)

    db.commit()
    db.refresh(exercise)
    return exercise
