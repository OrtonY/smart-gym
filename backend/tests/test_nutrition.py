from datetime import datetime

from app.models.ai_provider_config import AiProviderConfig
from app.models.nutrition_log import NutritionLog
from app.services.ai_config_service import encrypt_api_key


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _provider(user_id: int, is_active: bool = True) -> AiProviderConfig:
    return AiProviderConfig(
        user_id=user_id,
        provider_type="openai-compatible",
        base_url="https://example.test/v1",
        model_name="test-model",
        api_key_encrypted=encrypt_api_key("test-key"),
        is_active=is_active,
    )


def _manual_payload():
    return {
        "logged_at": "2026-06-07T12:00:00",
        "meal_type": "lunch",
        "food_name": "鸡胸肉沙拉",
        "description": "少油沙拉",
        "calories_kcal": 420,
        "protein_g": 35.0,
        "carbs_g": 28.0,
        "fat_g": 14.0,
    }


def test_user_can_create_and_list_own_nutrition_logs(client, create_user_and_token):
    _, token = create_user_and_token("nutrition-owner@example.com", role="user")

    create_response = client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json=_manual_payload(),
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["food_name"] == "鸡胸肉沙拉"
    assert created["calories_kcal"] == 420
    assert created["user_id"] > 0

    list_response = client.get("/api/nutrition/logs", headers=_auth(token))

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == created["id"]


def test_create_nutrition_log_rejects_user_id_override(client, create_user_and_token):
    _, token = create_user_and_token("nutrition-no-user-id@example.com", role="user")
    payload = _manual_payload()
    payload["user_id"] = 999

    response = client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json=payload,
    )

    assert response.status_code == 422


def test_user_cannot_read_other_users_nutrition_logs(
    client, db_session, create_user_and_token
):
    owner, _ = create_user_and_token("nutrition-private-owner@example.com", role="user")
    _, viewer_token = create_user_and_token(
        "nutrition-private-viewer@example.com", role="user"
    )
    log = NutritionLog(
        user_id=owner.id,
        logged_at=datetime(2026, 6, 7, 12, 0, 0),
        meal_type="lunch",
        food_name="私有餐食",
        calories_kcal=500,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    response = client.get(f"/api/nutrition/logs/{log.id}", headers=_auth(viewer_token))

    assert response.status_code == 404


def test_food_recognition_requires_current_user_provider_config(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    other_user, _ = create_user_and_token("nutrition-ai-other@example.com")
    _, token = create_user_and_token("nutrition-ai-current@example.com")
    db_session.add(_provider(other_user.id))
    db_session.commit()

    response = client.post(
        "/api/nutrition/recognize",
        headers=_auth(token),
        data={"meal_type": "lunch", "description": "一份沙拉"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI provider config not found"


def test_food_recognition_uses_current_user_provider_and_saves_image(
    client, db_session, create_user_and_token, monkeypatch, tmp_path
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path))
    user, token = create_user_and_token("nutrition-ai-save@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/nutrition/recognize",
        headers=_auth(token),
        data={
            "meal_type": "lunch",
            "logged_at": "2026-06-07T12:00:00",
            "description": "一份鸡胸肉沙拉",
        },
        files={"image": ("food.jpg", b"fake-image-bytes", "image/jpeg")},
    )

    assert response.status_code == 201
    log = response.json()["log"]
    assert log["food_name"] == "鸡胸肉沙拉"
    assert log["calories_kcal"] == 420
    assert log["ai_provider_type"] == "openai-compatible"
    assert log["ai_model_name"] == "test-model"
    assert log["ai_confidence"] == 0.84
    assert log["image_path"].startswith(f"nutrition/{user.id}/")
    assert (tmp_path / log["image_path"]).exists()


def test_user_can_correct_own_nutrition_log(client, db_session, create_user_and_token):
    user, token = create_user_and_token("nutrition-correct@example.com")
    log = NutritionLog(
        user_id=user.id,
        logged_at=datetime(2026, 6, 7, 18, 0, 0),
        meal_type="dinner",
        food_name="AI 餐食",
        calories_kcal=600,
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    response = client.put(
        f"/api/nutrition/logs/{log.id}/correction",
        headers=_auth(token),
        json={
            "food_name": "牛肉饭",
            "calories_kcal": 720,
            "user_correction": "实际有一份米饭和牛肉",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["food_name"] == "牛肉饭"
    assert data["calories_kcal"] == 720
    assert data["user_correction"] == "实际有一份米饭和牛肉"
