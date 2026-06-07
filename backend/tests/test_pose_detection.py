from datetime import datetime
from typing import Optional

from app.models.exercise import Exercise
from app.models.pose_detection_result import PoseDetectionResult
from app.models.workout_session import WorkoutSession


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _published_exercise(db_session) -> Exercise:
    exercise = Exercise(
        slug="bodyweight-squat",
        name="徒手深蹲",
        target_muscle="腿部",
        difficulty="beginner",
        detection_rules={"type": "squat", "bottom_angle": 115, "top_angle": 155},
        is_published=True,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)
    return exercise


def _pose_payload(
    exercise_id: Optional[int] = None, workout_session_id: Optional[int] = None
):
    return {
        "workout_session_id": workout_session_id,
        "exercise_id": exercise_id,
        "workout_mode_id": None,
        "started_at": "2026-06-07T08:00:00",
        "ended_at": "2026-06-07T08:02:00",
        "duration_seconds": 120,
        "reps_counted": 10,
        "score": 84.5,
        "feedback_summary": "膝盖轨迹稳定",
        "metrics_json": {"source": "mediapipe_pose_landmarker"},
        "landmarks_sample_json": {"frames": []},
    }


def test_user_can_create_and_list_own_pose_detection_results(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("pose-owner@example.com", role="user")
    exercise = _published_exercise(db_session)

    create_response = client.post(
        "/api/pose/results",
        headers=_auth(token),
        json=_pose_payload(exercise_id=exercise.id),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["exercise_id"] == exercise.id
    assert created["reps_counted"] == 10
    assert created["metrics_json"]["source"] == "mediapipe_pose_landmarker"

    list_response = client.get("/api/pose/results", headers=_auth(token))

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == created["id"]


def test_user_cannot_read_other_users_pose_detection_results(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("pose-private-owner@example.com", role="user")
    _, viewer_token = create_user_and_token(
        "pose-private-viewer@example.com", role="user"
    )
    result = PoseDetectionResult(
        user_id=owner.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        duration_seconds=90,
        reps_counted=8,
        score=80,
        metrics_json={"source": "test"},
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    response = client.get(f"/api/pose/results/{result.id}", headers=_auth(viewer_token))

    assert response.status_code == 404


def test_create_pose_result_rejects_user_id_override(client, create_user_and_token):
    _, token = create_user_and_token("pose-no-user-id@example.com", role="user")
    payload = _pose_payload()
    payload["user_id"] = 999

    response = client.post("/api/pose/results", headers=_auth(token), json=payload)

    assert response.status_code == 422


def test_create_pose_result_rejects_cross_user_workout_session(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("pose-session-owner@example.com", role="user")
    _, viewer_token = create_user_and_token("pose-session-viewer@example.com", role="user")
    session = WorkoutSession(
        user_id=owner.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        duration_minutes=30,
        calories_burned=100,
        status="completed",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    response = client.post(
        "/api/pose/results",
        headers=_auth(viewer_token),
        json=_pose_payload(workout_session_id=session.id),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workout session not found"


def test_create_pose_result_rejects_unpublished_exercise(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("pose-draft-exercise@example.com", role="user")
    exercise = Exercise(
        slug="draft-pose-exercise",
        name="Draft Pose Exercise",
        target_muscle="全身",
        difficulty="beginner",
        is_published=False,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)

    response = client.post(
        "/api/pose/results",
        headers=_auth(token),
        json=_pose_payload(exercise_id=exercise.id),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Exercise not found"
