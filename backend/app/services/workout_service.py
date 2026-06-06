from __future__ import annotations

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models.workout_session import WorkoutSession
from app.schemas.workouts import WorkoutSessionCreate


def create_workout_session(
    db: Session, user_id: int, payload: WorkoutSessionCreate
) -> WorkoutSession:
    workout_session = WorkoutSession(user_id=user_id, **payload.model_dump())
    db.add(workout_session)
    db.commit()
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
