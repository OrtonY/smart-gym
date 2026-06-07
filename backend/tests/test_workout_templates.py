from app.models.workout_template import WorkoutTemplate
from app.services.content_seed import seed_default_training_content


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _template_payload(
    slug: str = "lower-body-start",
    title: str = "入门下肢激活",
    is_published: bool = True,
) -> dict[str, object]:
    return {
        "slug": slug,
        "title": title,
        "description": "18 分钟臀腿基础训练",
        "goal": "strength",
        "difficulty": "beginner",
        "target_muscles": "臀腿、核心",
        "estimated_duration_minutes": 18,
        "cover_url": None,
        "tags": ["lower", "beginner"],
        "recommendation_weight": 10,
        "is_published": is_published,
        "steps": [
            {
                "sort_order": 0,
                "exercise_id": None,
                "workout_mode_id": None,
                "title": "徒手深蹲",
                "sets": 3,
                "reps": 12,
                "duration_seconds": None,
                "rest_seconds": 45,
                "instruction": "保持膝盖稳定",
                "allow_pose_detection": True,
            }
        ],
    }


def test_user_lists_only_published_templates(client, create_user_and_token):
    _, user_token = create_user_and_token("template-user@example.com")
    _, admin_token = create_user_and_token("template-admin@example.com", role="admin")
    client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=_template_payload("draft-template", "草稿", is_published=False),
    )
    client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=_template_payload("published-template", "已发布", is_published=True),
    )

    response = client.get("/api/workout-templates", headers=_auth(user_token))

    assert response.status_code == 200
    assert [item["slug"] for item in response.json()] == ["published-template"]


def test_admin_creates_template_with_steps(client, create_user_and_token):
    _, admin_token = create_user_and_token(
        "template-admin-create@example.com", role="admin"
    )

    response = client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=_template_payload(),
    )

    assert response.status_code == 201
    assert response.json()["slug"] == "lower-body-start"
    assert response.json()["steps"][0]["title"] == "徒手深蹲"


def test_admin_updates_template_and_replaces_steps(client, create_user_and_token):
    _, admin_token = create_user_and_token(
        "template-admin-update@example.com", role="admin"
    )
    created = client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=_template_payload("update-template", "待更新"),
    ).json()

    response = client.put(
        f"/api/admin/workout-templates/{created['id']}",
        headers=_auth(admin_token),
        json={
            "title": "已更新",
            "steps": [
                {
                    "sort_order": 0,
                    "title": "平板支撑",
                    "duration_seconds": 60,
                    "rest_seconds": 30,
                    "allow_pose_detection": True,
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["title"] == "已更新"
    assert [step["title"] for step in response.json()["steps"]] == ["平板支撑"]


def test_user_can_filter_templates(client, create_user_and_token):
    _, admin_token = create_user_and_token(
        "template-filter-admin@example.com", role="admin"
    )
    _, user_token = create_user_and_token("template-filter-user@example.com")
    client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=_template_payload("strength-template", "力量模板"),
    )
    cardio_payload = _template_payload("cardio-template", "燃脂模板")
    cardio_payload["goal"] = "fat_loss"
    cardio_payload["target_muscles"] = "全身"
    cardio_payload["estimated_duration_minutes"] = 30
    client.post(
        "/api/admin/workout-templates",
        headers=_auth(admin_token),
        json=cardio_payload,
    )

    response = client.get(
        "/api/workout-templates?goal=fat_loss&max_duration=30",
        headers=_auth(user_token),
    )

    assert response.status_code == 200
    assert [item["slug"] for item in response.json()] == ["cardio-template"]


def test_non_admin_cannot_create_template(client, create_user_and_token):
    _, token = create_user_and_token("template-non-admin@example.com")

    response = client.post(
        "/api/admin/workout-templates",
        headers=_auth(token),
        json=_template_payload(),
    )

    assert response.status_code == 403


def test_seed_default_training_content_creates_templates(db_session):
    seed_default_training_content(db_session)

    slugs = {template.slug for template in db_session.query(WorkoutTemplate).all()}

    assert len(slugs) >= 6
    assert "lower-body-foundation" in slugs
