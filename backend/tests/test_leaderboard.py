from datetime import datetime

from app.models.leaderboard_snapshot import LeaderboardSnapshot

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
    assert refresh_response.json() == [
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
    assert "email" not in str(refresh_response.json())
    assert "user_id" not in str(refresh_response.json())

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


def test_leaderboard_supports_calories_and_sessions_count_metrics(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("metric-user@example.com", role="user")
    user.display_name = "Metric User"
    db_session.add_all(
        [
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 4, 8, 0, 0),
                duration_minutes=25,
                calories_burned=160,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 5, 8, 0, 0),
                duration_minutes=35,
                calories_burned=220,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    calories_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "weekly",
            "metric_type": "calories_burned",
            "anchor_date": "2026-06-06",
        },
    )
    sessions_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "weekly",
            "metric_type": "sessions_count",
            "anchor_date": "2026-06-06",
        },
    )

    assert calories_response.status_code == 200
    assert calories_response.json()[0]["value"] == 380.0
    assert sessions_response.status_code == 200
    assert sessions_response.json()[0]["value"] == 2.0


def test_leaderboard_uses_completed_sessions_inside_period_only(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("bounds@example.com", role="user")
    user.display_name = "Bounds"
    db_session.add_all(
        [
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 1, 0, 0, 0),
                duration_minutes=10,
                calories_burned=50,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 7, 23, 59, 59),
                duration_minutes=20,
                calories_burned=100,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 8, 0, 0, 0),
                duration_minutes=100,
                calories_burned=500,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 4, 8, 0, 0),
                duration_minutes=90,
                calories_burned=450,
                status="abandoned",
            ),
        ]
    )
    db_session.commit()

    response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "weekly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-06",
        },
    )

    assert response.status_code == 200
    assert response.json()[0]["value"] == 30.0


def test_monthly_leaderboard_uses_calendar_month_bounds(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("monthly@example.com", role="user")
    user.display_name = "Monthly"
    db_session.add_all(
        [
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 1, 0, 0, 0),
                duration_minutes=15,
                calories_burned=80,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 6, 30, 23, 59, 59),
                duration_minutes=25,
                calories_burned=130,
                status="completed",
            ),
            WorkoutSession(
                user_id=user.id,
                started_at=datetime(2026, 7, 1, 0, 0, 0),
                duration_minutes=60,
                calories_burned=300,
                status="completed",
            ),
        ]
    )
    db_session.commit()

    response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "monthly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-15",
        },
    )

    assert response.status_code == 200
    assert response.json()[0]["value"] == 40.0


def test_repeated_refresh_replaces_existing_snapshots(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("repeat@example.com", role="user")
    user.display_name = "Repeat"
    db_session.add(
        WorkoutSession(
            user_id=user.id,
            started_at=datetime(2026, 6, 4, 8, 0, 0),
            duration_minutes=30,
            calories_burned=180,
            status="completed",
        )
    )
    db_session.commit()

    payload = {
        "period_type": "weekly",
        "metric_type": "duration_minutes",
        "anchor_date": "2026-06-06",
    }
    first_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    second_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == second_response.json()
    assert db_session.query(LeaderboardSnapshot).count() == 1


def test_empty_newer_refresh_clears_stale_leaderboard(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("stale@example.com", role="user")
    user.display_name = "Stale"
    db_session.add(
        WorkoutSession(
            user_id=user.id,
            started_at=datetime(2026, 6, 4, 8, 0, 0),
            duration_minutes=30,
            calories_burned=180,
            status="completed",
        )
    )
    db_session.commit()

    populated_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "weekly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-06",
        },
    )
    empty_response = client.post(
        "/api/leaderboard/refresh",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period_type": "weekly",
            "metric_type": "duration_minutes",
            "anchor_date": "2026-06-20",
        },
    )
    read_response = client.get(
        "/api/leaderboard?period_type=weekly&metric_type=duration_minutes",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert populated_response.status_code == 200
    assert empty_response.status_code == 200
    assert empty_response.json() == []
    assert read_response.status_code == 200
    assert read_response.json() == []


def test_leaderboard_snapshot_has_unique_period_metric_user_constraint():
    constraints = {
        constraint.name
        for constraint in LeaderboardSnapshot.__table__.constraints
    }

    assert "uq_leaderboard_snapshot_period_metric_user" in constraints
