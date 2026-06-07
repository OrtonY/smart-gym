def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_today_training_prefers_planned_plan_item(client, create_user_and_token):
    _, token = create_user_and_token("today-plan@example.com")
    client.post(
        "/api/training-plans",
        headers=_auth(token),
        json={
            "title": "本周",
            "items": [
                {
                    "scheduled_date": "2026-06-07",
                    "sort_order": 0,
                    "title": "今日深蹲",
                    "sets": 3,
                    "reps": 12,
                    "duration_seconds": 900,
                    "rest_seconds": 45,
                    "instruction": "保持膝盖稳定",
                }
            ],
            "change_summary": "today",
        },
    )

    response = client.get("/api/today/training?date=2026-06-07", headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["source_type"] == "plan"
    assert response.json()["title"] == "今日深蹲"
    assert response.json()["steps"][0]["title"] == "今日深蹲"
    assert response.json()["empty_state"] is None


def test_today_training_falls_back_to_template(client, create_user_and_token):
    _, admin_token = create_user_and_token("today-admin@example.com", role="admin")
    _, user_token = create_user_and_token("today-user@example.com")
    client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json={
            "slug": "today-template",
            "title": "推荐模板",
            "goal": "fat_loss",
            "difficulty": "beginner",
            "target_muscles": "全身",
            "estimated_duration_minutes": 15,
            "tags": [],
            "recommendation_weight": 20,
            "is_published": True,
            "steps": [
                {
                    "sort_order": 0,
                    "title": "热身",
                    "duration_seconds": 180,
                    "rest_seconds": 30,
                    "allow_pose_detection": False,
                }
            ],
        },
    )

    response = client.get(
        "/api/today/training?date=2026-06-07",
        headers=_auth(user_token),
    )

    assert response.status_code == 200
    assert response.json()["source_type"] == "template"
    assert response.json()["title"] == "推荐模板"
    assert response.json()["empty_state"] is None


def test_today_training_returns_empty_state_without_plan_or_template(
    client, create_user_and_token
):
    _, token = create_user_and_token("today-empty@example.com")

    response = client.get(
        "/api/today/training?date=2026-06-07",
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert response.json()["source_type"] == "empty"
    assert response.json()["empty_state"] == "no_training_content"
