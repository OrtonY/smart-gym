def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_reconcile_marks_missed_yesterday_as_skipped(client, create_user_and_token):
    _, token = create_user_and_token("skip-yesterday@example.com")
    plan = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json={
            "title": "本周",
            "items": [
                {
                    "scheduled_date": "2026-06-06",
                    "sort_order": 0,
                    "title": "昨日训练",
                    "duration_seconds": 900,
                }
            ],
            "change_summary": "skip",
        },
    ).json()

    response = client.post(
        "/api/training-plans/reconcile",
        headers=_auth(token),
        json={"today": "2026-06-07"},
    )

    assert response.status_code == 200
    assert response.json()["skipped_items"] == 1
    detail = client.get(f"/api/training-plans/{plan['id']}", headers=_auth(token)).json()
    assert detail["items"][0]["status"] == "skipped"


def test_reconcile_adds_ad_hoc_template_session_to_calendar(
    client, create_user_and_token
):
    _, admin_token = create_user_and_token("adhoc-admin@example.com", role="admin")
    _, user_token = create_user_and_token("adhoc-user@example.com")
    template = client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json={
            "slug": "adhoc-template",
            "title": "临时训练",
            "goal": "strength",
            "difficulty": "beginner",
            "target_muscles": "全身",
            "estimated_duration_minutes": 10,
            "tags": [],
            "is_published": True,
            "steps": [],
        },
    ).json()
    session = client.post(
        "/api/workouts/sessions/start",
        headers=_auth(user_token),
        json={
            "source_type": "template",
            "source_template_id": template["id"],
            "pose_detection_enabled": False,
        },
    ).json()
    client.put(
        f"/api/workouts/sessions/{session['id']}/finish",
        headers=_auth(user_token),
        json={
            "ended_at": "2026-06-06T08:10:00",
            "duration_minutes": 10,
            "calories_burned": 60,
            "status": "completed",
            "steps": [],
        },
    )

    response = client.post(
        "/api/training-plans/reconcile",
        headers=_auth(user_token),
        json={"today": "2026-06-07"},
    )

    assert response.status_code == 200
    assert response.json()["ad_hoc_entries_created"] == 1
    plans = client.get("/api/training-plans", headers=_auth(user_token)).json()
    detail = client.get(f"/api/training-plans/{plans[0]['id']}", headers=_auth(user_token)).json()
    assert detail["items"][0]["entry_type"] == "ad_hoc"
    assert detail["items"][0]["title"] == "临时训练"
    assert detail["items"][0]["linked_workout_session_id"] == session["id"]
