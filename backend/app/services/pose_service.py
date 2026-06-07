from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.ai_provider_config import AiProviderConfig
from app.models.exercise import Exercise
from app.models.pose_detection_result import PoseDetectionResult
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession
from app.schemas.pose import PoseDetectionResultCreate


def _published_exercise(db: Session, exercise_id: int) -> Optional[Exercise]:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or not exercise.is_published:
        return None
    return exercise


def _active_workout_mode(db: Session, workout_mode_id: int) -> Optional[WorkoutMode]:
    workout_mode = db.get(WorkoutMode, workout_mode_id)
    if workout_mode is None or not workout_mode.is_active:
        return None
    return workout_mode


def create_pose_detection_result(
    db: Session, user_id: int, payload: PoseDetectionResultCreate
) -> PoseDetectionResult:
    exercise_id = payload.exercise_id
    workout_mode_id = payload.workout_mode_id

    if payload.workout_session_id is not None:
        workout_session = db.get(WorkoutSession, payload.workout_session_id)
        if workout_session is None or workout_session.user_id != user_id:
            raise ValueError("Workout session not found")
        exercise_id = exercise_id if exercise_id is not None else workout_session.exercise_id
        workout_mode_id = (
            workout_mode_id
            if workout_mode_id is not None
            else workout_session.workout_mode_id
        )

    if exercise_id is not None and _published_exercise(db, exercise_id) is None:
        raise ValueError("Exercise not found")

    if workout_mode_id is not None and _active_workout_mode(db, workout_mode_id) is None:
        raise ValueError("Workout mode not found")

    data = payload.model_dump()
    data["exercise_id"] = exercise_id
    data["workout_mode_id"] = workout_mode_id
    result = PoseDetectionResult(user_id=user_id, **data)
    db.add(result)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Pose detection result could not be saved") from exc
    db.refresh(result)
    return result


def list_pose_detection_results(db: Session, user_id: int) -> list[PoseDetectionResult]:
    statement = (
        select(PoseDetectionResult)
        .where(PoseDetectionResult.user_id == user_id)
        .order_by(desc(PoseDetectionResult.started_at), desc(PoseDetectionResult.id))
    )
    return list(db.execute(statement).scalars())


def get_pose_detection_result(
    db: Session, user_id: int, result_id: int
) -> Optional[PoseDetectionResult]:
    statement = select(PoseDetectionResult).where(
        PoseDetectionResult.id == result_id,
        PoseDetectionResult.user_id == user_id,
    )
    return db.execute(statement).scalars().first()


def get_pose_result_exercise(
    db: Session, result: PoseDetectionResult
) -> Optional[Exercise]:
    if result.exercise_id is None:
        return None
    return db.get(Exercise, result.exercise_id)


def save_pose_advice(
    db: Session,
    result: PoseDetectionResult,
    config: AiProviderConfig,
    advice: str,
) -> PoseDetectionResult:
    result.ai_advice = advice
    result.ai_provider_type = config.provider_type
    result.ai_model_name = config.model_name
    result.ai_generated_at = datetime.utcnow()
    db.commit()
    db.refresh(result)
    return result
