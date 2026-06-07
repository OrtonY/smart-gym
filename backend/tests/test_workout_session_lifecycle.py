def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_start_plan_workout_returns_step_snapshot(client, create_user_and_token):
    _, token = create_user_and_token("start-plan@example.com")
    plan = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json={
            "title": "本周",
            "items": [
                {
                    "scheduled_date": "2026-06-07",
                    "sort_order": 0,
                    "title": "深蹲",
                    "sets": 3,
                    "reps": 12,
                    "duration_seconds": 900,
                }
            ],
            "change_summary": "start",
        },
    ).json()

    response = client.post(
        "/api/workouts/sessions/start",
        headers=_auth(token),
        json={
            "source_type": "plan",
            "source_plan_id": plan["id"],
            "source_plan_item_id": plan["items"][0]["id"],
            "pose_detection_enabled": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["pose_detection_enabled"] is True
    assert response.json()["source_type"] == "plan"
    assert response.json()["steps"][0]["title"] == "深蹲"
    assert response.json()["steps"][0]["planned_reps"] == 12


def test_start_free_workout_from_exercise_returns_single_step(
    client, create_user_and_token
):
    _, token = create_user_and_token("start-exercise@example.com", role="admin")
    exercise = client.post(
        "/api/admin/exercises",
        headers=_auth(token),
        json={
            "slug": "push-up-free-start",
            "name": "俯卧撑",
            "target_muscle": "胸",
            "difficulty": "beginner",
            "description": None,
            "tutorial_url": None,
            "media_url": None,
            "detection_rules": {"type": "push_up"},
            "is_published": True,
        },
    ).json()

    response = client.post(
        "/api/workouts/sessions/start",
        headers=_auth(token),
        json={
            "source_type": "free",
            "exercise_id": exercise["id"],
            "pose_detection_enabled": True,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["source_type"] == "free"
    assert body["exercise_id"] == exercise["id"]
    assert body["total_steps_count"] == 1
    assert body["steps"][0]["title"] == "俯卧撑"
    assert body["steps"][0]["exercise_id"] == exercise["id"]


def test_start_free_workout_rejects_unpublished_exercise_without_session(
    client, create_user_and_token
):
    _, token = create_user_and_token("start-unpublished@example.com", role="admin")
    exercise = client.post(
        "/api/admin/exercises",
        headers=_auth(token),
        json={
            "slug": "draft-free-start",
            "name": "草稿动作",
            "target_muscle": "核心",
            "difficulty": "beginner",
            "description": None,
            "tutorial_url": None,
            "media_url": None,
            "detection_rules": None,
            "is_published": False,
        },
    ).json()

    response = client.post(
        "/api/workouts/sessions/start",
        headers=_auth(token),
        json={
            "source_type": "free",
            "exercise_id": exercise["id"],
            "pose_detection_enabled": False,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Exercise not found"
    sessions = client.get("/api/workouts/sessions", headers=_auth(token)).json()
    assert sessions == []


def test_finish_workout_saves_steps_and_updates_plan_item(
    client, create_user_and_token
):
    _, token = create_user_and_token("finish-plan@example.com")
    plan = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json={
            "title": "本周",
            "items": [
                {
                    "scheduled_date": "2026-06-07",
                    "sort_order": 0,
                    "title": "深蹲",
                    "sets": 3,
                    "reps": 12,
                    "duration_seconds": 900,
                }
            ],
            "change_summary": "finish",
        },
    ).json()
    session = client.post(
        "/api/workouts/sessions/start",
        headers=_auth(token),
        json={
            "source_type": "plan",
            "source_plan_id": plan["id"],
            "source_plan_item_id": plan["items"][0]["id"],
            "pose_detection_enabled": False,
        },
    ).json()

    response = client.put(
        f"/api/workouts/sessions/{session['id']}/finish",
        headers=_auth(token),
        json={
            "ended_at": "2026-06-07T08:20:00",
            "duration_minutes": 20,
            "calories_burned": 120,
            "status": "completed",
            "steps": [
                {
                    "sort_order": 0,
                    "title": "深蹲",
                    "actual_reps": 36,
                    "actual_duration_seconds": 880,
                    "score": 90,
                    "status": "completed",
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["completed_steps_count"] == 1
    assert response.json()["steps"][0]["actual_reps"] == 36
    detail = client.get(f"/api/training-plans/{plan['id']}", headers=_auth(token)).json()
    assert detail["items"][0]["status"] == "completed"
    assert detail["items"][0]["actual_score"] == 90
