from datetime import datetime

from app.models.workout_session import WorkoutSession


def test_refresh_and_read_weekly_leaderboard_exposes_only_public_fields(
    client, db_session, create_user_and_token
):
    alice, alice_token = create_user_and_token("alice@example.com", role="user")
    bob, _ = create_user_and_token("bob@example.com", role="user")
    alice.display_name = "Alice"
    alice.avatar_url = "https://example.com/alice.png"
    bob.display_name = "Bob"
    db_session.add_all(
        [
            WorkoutSession(
                user_id=alice.id,
                started_at=datetime(2026, 6, 2, 8, 0, 0),
                duration_minutes=30,
                calories_burned=180,
                status="completed",
            ),
            WorkoutSession(
                user_id=bob.id,
                started_at=datetime(2026, 6, 3, 8, 0, 0),
                duration_minutes=50,
                calories_burned=310,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    refresh_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={
            "period_type": "weekly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-06",
        },
    )
    assert refresh_response.status_code == 200

    read_response = client.get(
        "/api/leaderboard?period_type=weekly&metric_type=duration_minutes",
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    assert read_response.status_code == 200
    assert read_response.json() == [
        {
            "display_name": "Bob",
            "avatar_url": None,
            "value": 50.0,
            "rank": 1,
            "period_type": "weekly",
            "metric_type": "duration_minutes",
        },
        {
            "display_name": "Alice",
            "avatar_url": "https://example.com/alice.png",
            "value": 30.0,
            "rank": 2,
            "period_type": "weekly",
            "metric_type": "duration_minutes",
        },
    ]
    assert "email" not in str(read_response.json())
    assert "user_id" not in str(read_response.json())
