from app.schemas.training_plans import TrainingPlanCreate
from app.services.training_plan_service import create_training_plan


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _payload(title: str = "力量基础") -> dict[str, object]:
    return {
        "title": title,
        "items": [
            {
                "day_of_week": 1,
                "sort_order": 0,
                "exercise_id": None,
                "workout_mode_id": None,
                "title": "徒手深蹲",
                "sets": 3,
                "reps": 12,
                "duration_minutes": None,
                "notes": "保持膝盖稳定",
            }
        ],
        "change_summary": "初始课表",
    }


def test_user_can_create_list_and_get_training_plan(
    client, create_user_and_token
):
    _, token = create_user_and_token("plan-route@example.com")

    create_response = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json=_payload(),
    )
    list_response = client.get("/api/training-plans", headers=_auth(token))
    detail_response = client.get(
        f"/api/training-plans/{create_response.json()['id']}",
        headers=_auth(token),
    )

    assert create_response.status_code == 201
    assert create_response.json()["title"] == "力量基础"
    assert create_response.json()["current_version"] == 1
    assert [item["title"] for item in create_response.json()["items"]] == ["徒手深蹲"]
    assert list_response.status_code == 200
    assert [item["title"] for item in list_response.json()] == ["力量基础"]
    assert detail_response.status_code == 200
    assert detail_response.json()["versions"][0]["version_number"] == 1


def test_user_can_create_training_item_with_date_without_weekday(
    client, create_user_and_token
):
    _, token = create_user_and_token("plan-date-route@example.com")
    payload = _payload("日期课表")
    item = payload["items"][0]
    item.pop("day_of_week")
    item["scheduled_date"] = "2026-06-08"

    response = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json=payload,
    )

    assert response.status_code == 201
    assert response.json()["items"][0]["scheduled_date"] == "2026-06-08"
    assert response.json()["items"][0]["day_of_week"] == 1


def test_user_can_replace_training_plan_items(client, create_user_and_token):
    _, token = create_user_and_token("replace-route@example.com")
    create_response = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json=_payload(),
    )

    response = client.put(
        f"/api/training-plans/{create_response.json()['id']}/items",
        headers=_auth(token),
        json={
            "items": [
                {
                    "day_of_week": 2,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "俯卧撑",
                    "sets": 4,
                    "reps": 10,
                    "duration_minutes": None,
                    "notes": "控制下放速度",
                }
            ],
            "change_summary": "改为上肢训练",
        },
    )

    assert response.status_code == 200
    assert response.json()["current_version"] == 2
    assert [item["title"] for item in response.json()["items"]] == ["俯卧撑"]
    assert [version["version_number"] for version in response.json()["versions"]] == [
        2,
        1,
    ]


def test_user_can_list_training_plan_versions(client, create_user_and_token):
    _, token = create_user_and_token("versions-route@example.com")
    create_response = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json=_payload(),
    )
    client.put(
        f"/api/training-plans/{create_response.json()['id']}/items",
        headers=_auth(token),
        json={
            "items": [
                {
                    "day_of_week": 3,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "跑步",
                    "sets": None,
                    "reps": None,
                    "duration_minutes": 30,
                    "notes": None,
                }
            ],
            "change_summary": "有氧日",
        },
    )

    response = client.get(
        f"/api/training-plans/{create_response.json()['id']}/versions",
        headers=_auth(token),
    )

    assert response.status_code == 200
    assert [version["version_number"] for version in response.json()] == [2, 1]


def test_user_cannot_access_other_users_training_plan(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("plan-owner-route@example.com")
    _, viewer_token = create_user_and_token("plan-viewer-route@example.com")
    plan = create_training_plan(
        db_session,
        owner.id,
        TrainingPlanCreate.model_validate(_payload("私有课表")),
    )

    detail_response = client.get(
        f"/api/training-plans/{plan.id}",
        headers=_auth(viewer_token),
    )
    replace_response = client.put(
        f"/api/training-plans/{plan.id}/items",
        headers=_auth(viewer_token),
        json={
            "items": [
                {
                    "day_of_week": 1,
                    "sort_order": 0,
                    "exercise_id": None,
                    "workout_mode_id": None,
                    "title": "越权修改",
                    "sets": 1,
                    "reps": 1,
                    "duration_minutes": None,
                    "notes": None,
                }
            ],
            "change_summary": None,
        },
    )
    versions_response = client.get(
        f"/api/training-plans/{plan.id}/versions",
        headers=_auth(viewer_token),
    )

    assert detail_response.status_code == 404
    assert replace_response.status_code == 404
    assert versions_response.status_code == 404


def test_create_training_plan_rejects_user_id_override(
    client, create_user_and_token
):
    _, token = create_user_and_token("override-plan@example.com")
    payload = _payload()
    payload["user_id"] = 999

    response = client.post(
        "/api/training-plans",
        headers=_auth(token),
        json=payload,
    )

    assert response.status_code == 422
