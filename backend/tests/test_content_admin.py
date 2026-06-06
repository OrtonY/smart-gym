def test_admin_can_create_workout_mode_and_user_can_read_active_catalog(
    client, create_user_and_token
):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    _, user_token = create_user_and_token("member@example.com", role="user")

    create_response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "strength",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["code"] == "strength"

    catalog_response = client.get(
        "/api/catalog/workout-modes",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert catalog_response.status_code == 200
    assert catalog_response.json() == [
        {
            "id": create_response.json()["id"],
            "code": "strength",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        }
    ]


def test_non_admin_cannot_create_workout_mode(client, create_user_and_token):
    _, token = create_user_and_token("member@example.com", role="user")

    response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "code": "cardio",
            "name": "有氧训练",
            "description": "跑步和椭圆机",
            "estimated_calories_per_hour": 420,
            "is_active": True,
        },
    )

    assert response.status_code == 403


def test_admin_create_workout_mode_rejects_invalid_code(
    client, create_user_and_token
):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")

    response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "s",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        },
    )

    assert response.status_code == 422


def test_admin_cannot_update_workout_mode_code(client, create_user_and_token):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    create_response = client.post(
        "/api/admin/workout-modes",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "strength",
            "name": "力量训练",
            "description": "基础力量训练模式",
            "estimated_calories_per_hour": 360,
            "is_active": True,
        },
    )

    response = client.put(
        f"/api/admin/workout-modes/{create_response.json()['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"code": "cardio", "name": "力量训练进阶"},
    )

    assert response.status_code == 422


def test_admin_can_create_exercise_and_catalog_only_returns_published(
    client, create_user_and_token
):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    _, user_token = create_user_and_token("member@example.com", role="user")

    published_response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "bodyweight-squat",
            "name": "徒手深蹲",
            "target_muscle": "腿部",
            "difficulty": "beginner",
            "description": "基础下肢训练动作",
            "tutorial_url": "https://example.com/squat",
            "media_url": "https://example.com/squat.mp4",
            "detection_rules": {"counter": "knee_angle"},
            "is_published": True,
        },
    )
    draft_response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "draft-push-up",
            "name": "草稿俯卧撑",
            "target_muscle": "胸部",
            "difficulty": "intermediate",
            "description": "未发布内容",
            "tutorial_url": None,
            "media_url": None,
            "detection_rules": None,
            "is_published": False,
        },
    )

    assert published_response.status_code == 201
    assert draft_response.status_code == 201

    catalog_response = client.get(
        "/api/catalog/exercises",
        headers={"Authorization": f"Bearer {user_token}"},
    )

    assert catalog_response.status_code == 200
    exercises = catalog_response.json()
    assert [item["slug"] for item in exercises] == ["bodyweight-squat"]
    assert exercises[0]["detection_rules"] == {"counter": "knee_angle"}


def test_admin_create_exercise_rejects_invalid_slug(client, create_user_and_token):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")

    response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "s",
            "name": "徒手深蹲",
            "target_muscle": "腿部",
            "difficulty": "beginner",
            "description": "基础下肢训练动作",
            "tutorial_url": "https://example.com/squat",
            "media_url": "https://example.com/squat.mp4",
            "detection_rules": {"counter": "knee_angle"},
            "is_published": True,
        },
    )

    assert response.status_code == 422


def test_admin_create_exercise_rejects_invalid_difficulty(
    client, create_user_and_token
):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")

    response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "bodyweight-squat",
            "name": "徒手深蹲",
            "target_muscle": "腿部",
            "difficulty": "expert",
            "description": "基础下肢训练动作",
            "tutorial_url": "https://example.com/squat",
            "media_url": "https://example.com/squat.mp4",
            "detection_rules": {"counter": "knee_angle"},
            "is_published": True,
        },
    )

    assert response.status_code == 422


def test_admin_cannot_update_exercise_slug(client, create_user_and_token):
    _, admin_token = create_user_and_token("admin@example.com", role="admin")
    create_response = client.post(
        "/api/admin/exercises",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": "bodyweight-squat",
            "name": "徒手深蹲",
            "target_muscle": "腿部",
            "difficulty": "beginner",
            "description": "基础下肢训练动作",
            "tutorial_url": "https://example.com/squat",
            "media_url": "https://example.com/squat.mp4",
            "detection_rules": {"counter": "knee_angle"},
            "is_published": True,
        },
    )

    response = client.put(
        f"/api/admin/exercises/{create_response.json()['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"slug": "new-squat", "name": "徒手深蹲进阶"},
    )

    assert response.status_code == 422
