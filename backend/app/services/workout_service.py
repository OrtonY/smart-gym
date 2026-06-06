from __future__ import annotations

from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession
from app.schemas.workouts import WorkoutSessionCreate


def create_workout_session(
    db: Session, user_id: int, payload: WorkoutSessionCreate
) -> WorkoutSession:
    if payload.workout_mode_id is not None and db.get(
        WorkoutMode, payload.workout_mode_id
    ) is None:
        raise ValueError("Workout mode not found")

    if (
        payload.exercise_id is not None
        and db.get(Exercise, payload.exercise_id) is None
    ):
        raise ValueError("Exercise not found")

    workout_session = WorkoutSession(user_id=user_id, **payload.model_dump())
    db.add(workout_session)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if payload.workout_mode_id is not None:
            raise ValueError("Workout mode not found") from exc
        if payload.exercise_id is not None:
            raise ValueError("Exercise not found") from exc
        raise
    db.refresh(workout_session)
    return workout_session


def list_workout_sessions(db: Session, user_id: int) -> list[WorkoutSession]:
    statement = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .order_by(desc(WorkoutSession.started_at), desc(WorkoutSession.id))
    )
    return list(db.execute(statement).scalars())


def get_workout_summary(db: Session, user_id: int) -> dict[str, int]:
    statement = select(
        func.count(WorkoutSession.id),
        func.coalesce(func.sum(WorkoutSession.duration_minutes), 0),
        func.coalesce(func.sum(WorkoutSession.calories_burned), 0),
    ).where(WorkoutSession.user_id == user_id)
    sessions_count, total_duration_minutes, total_calories_burned = db.execute(
        statement
    ).one()
    return {
        "sessions_count": int(sessions_count),
        "total_duration_minutes": int(total_duration_minutes),
        "total_calories_burned": int(total_calories_burned),
    }
