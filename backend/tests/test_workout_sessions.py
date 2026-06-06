from datetime import datetime

from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession


def test_user_can_create_and_list_own_workout_sessions(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    create_response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": None,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": "2026-06-06T08:35:00",
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": 80,
            "score": 86.5,
            "status": "completed",
            "notes": "深蹲和核心训练",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["duration_minutes"] == 35

    list_response = client.get(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["notes"] == "深蹲和核心训练"


def test_user_cannot_list_other_users_workout_sessions(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("owner@example.com", role="user")
    _, viewer_token = create_user_and_token("viewer@example.com", role="user")
    db_session.add(
        WorkoutSession(
            user_id=owner.id,
            started_at=datetime(2026, 6, 6, 8, 0, 0),
            duration_minutes=45,
            calories_burned=300,
            status="completed",
        )
    )
    db_session.commit()

    response = client.get(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_workout_summary_uses_only_current_user(
    client, db_session, create_user_and_token
):
    current_user, token = create_user_and_token("current@example.com", role="user")
    other_user, _ = create_user_and_token("other@example.com", role="user")
    db_session.add_all(
        [
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 6, 8, 0, 0),
                duration_minutes=30,
                calories_burned=180,
                status="completed",
            ),
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 7, 8, 0, 0),
                duration_minutes=40,
                calories_burned=260,
                status="completed",
            ),
            WorkoutSession(
                user_id=other_user.id,
                started_at=datetime(2026, 6, 7, 9, 0, 0),
                duration_minutes=200,
                calories_burned=1200,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/workouts/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "sessions_count": 2,
        "total_duration_minutes": 70,
        "total_calories_burned": 440,
    }


def test_workout_summary_uses_only_completed_sessions(
    client, db_session, create_user_and_token
):
    current_user, token = create_user_and_token("summary-status@example.com", role="user")
    db_session.add_all(
        [
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 6, 8, 0, 0),
                duration_minutes=30,
                calories_burned=180,
                status="completed",
            ),
            WorkoutSession(
                user_id=current_user.id,
                started_at=datetime(2026, 6, 7, 8, 0, 0),
                duration_minutes=120,
                calories_burned=900,
                status="abandoned",
            ),
        ]
    )
    db_session.commit()

    response = client.get(
        "/api/workouts/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "sessions_count": 1,
        "total_duration_minutes": 30,
        "total_calories_burned": 180,
    }


def test_create_workout_session_rejects_user_id_override(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "user_id": 999,
            "workout_mode_id": None,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 422


def test_create_workout_session_rejects_zero_workout_mode_id(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": 0,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 422


def test_create_workout_session_returns_404_for_missing_workout_mode(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": 999,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workout mode not found"


def test_create_workout_session_rejects_inactive_workout_mode(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("inactive-mode@example.com", role="user")
    workout_mode = WorkoutMode(
        code="draft-mode",
        name="Draft Mode",
        estimated_calories_per_hour=300,
        is_active=False,
    )
    db_session.add(workout_mode)
    db_session.commit()
    db_session.refresh(workout_mode)

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": workout_mode.id,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workout mode not found"


def test_create_workout_session_returns_404_for_missing_exercise(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": None,
            "exercise_id": 999,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Exercise not found"


def test_create_workout_session_rejects_unpublished_exercise(
    client, db_session, create_user_and_token
):
    _, token = create_user_and_token("unpublished-exercise@example.com", role="user")
    exercise = Exercise(
        slug="draft-exercise",
        name="Draft Exercise",
        target_muscle="全身",
        difficulty="beginner",
        is_published=False,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": None,
            "exercise_id": exercise.id,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "completed",
            "notes": None,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Exercise not found"


def test_create_workout_session_rejects_invalid_status(
    client, create_user_and_token
):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/workouts/sessions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workout_mode_id": None,
            "exercise_id": None,
            "started_at": "2026-06-06T08:00:00",
            "ended_at": None,
            "duration_minutes": 35,
            "calories_burned": 220,
            "reps": None,
            "score": None,
            "status": "paused",
            "notes": None,
        },
    )

    assert response.status_code == 422
