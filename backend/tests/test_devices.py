from datetime import datetime
from typing import Optional

from app.models.device_metric import DeviceMetric
from app.models.workout_session import WorkoutSession


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _heart_rate_payload(workout_session_id: Optional[int] = None):
    return {
        "source": "simulated",
        "workout_session_id": workout_session_id,
        "samples": [
            {"measured_at": "2026-06-07T08:00:00", "bpm": 118},
            {"measured_at": "2026-06-07T08:01:00", "bpm": 136},
            {"measured_at": "2026-06-07T08:02:00", "bpm": 142},
        ],
    }


def test_user_can_import_list_and_summarize_heart_rate_samples(
    client, create_user_and_token
):
    _, token = create_user_and_token("device-owner@example.com")

    create_response = client.post(
        "/api/devices/heart-rate/import",
        headers=_auth(token),
        json=_heart_rate_payload(),
    )

    assert create_response.status_code == 201
    created = create_response.json()["metrics"]
    assert len(created) == 3
    assert created[0]["metric_type"] == "heart_rate"
    assert created[0]["unit"] == "bpm"

    list_response = client.get(
        "/api/devices/metrics?metric_type=heart_rate", headers=_auth(token)
    )
    assert list_response.status_code == 200
    assert [item["value"] for item in list_response.json()] == [142.0, 136.0, 118.0]

    summary_response = client.get(
        "/api/devices/heart-rate/summary", headers=_auth(token)
    )
    assert summary_response.status_code == 200
    assert summary_response.json() == {
        "samples_count": 3,
        "latest_bpm": 142,
        "average_bpm": 132,
        "max_bpm": 142,
    }


def test_import_heart_rate_rejects_user_id_override(client, create_user_and_token):
    _, token = create_user_and_token("device-no-user-id@example.com")
    payload = _heart_rate_payload()
    payload["user_id"] = 999

    response = client.post(
        "/api/devices/heart-rate/import", headers=_auth(token), json=payload
    )

    assert response.status_code == 422


def test_user_cannot_list_other_users_device_metrics(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("device-private-owner@example.com")
    _, viewer_token = create_user_and_token("device-private-viewer@example.com")
    db_session.add(
        DeviceMetric(
            user_id=owner.id,
            source="simulated",
            metric_type="heart_rate",
            measured_at=datetime(2026, 6, 7, 8, 0, 0),
            value=128,
            unit="bpm",
            raw_json={"bpm": 128},
        )
    )
    db_session.commit()

    response = client.get("/api/devices/metrics", headers=_auth(viewer_token))

    assert response.status_code == 200
    assert response.json() == []


def test_import_heart_rate_rejects_cross_user_workout_session(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("device-session-owner@example.com")
    _, viewer_token = create_user_and_token("device-session-viewer@example.com")
    session = WorkoutSession(
        user_id=owner.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        duration_minutes=30,
        calories_burned=120,
        status="completed",
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    response = client.post(
        "/api/devices/heart-rate/import",
        headers=_auth(viewer_token),
        json=_heart_rate_payload(workout_session_id=session.id),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Workout session not found"
