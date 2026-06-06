from datetime import datetime

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
