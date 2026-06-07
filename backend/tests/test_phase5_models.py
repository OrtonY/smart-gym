from datetime import datetime

from app.models.device_metric import DeviceMetric
from app.models.nutrition_log import NutritionLog
from app.models.user import User


def _user(email: str) -> User:
    return User(
        email=email,
        display_name=email.split("@")[0],
        hashed_password="hashed",
        role="user",
        is_active=True,
    )


def test_nutrition_log_model_persists_private_ai_estimate(db_session):
    user = _user("nutrition-model@example.com")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    log = NutritionLog(
        user_id=user.id,
        logged_at=datetime(2026, 6, 7, 12, 0, 0),
        meal_type="lunch",
        food_name="鸡胸肉沙拉",
        description="一份鸡胸肉沙拉，少量橄榄油",
        image_path="nutrition/1/photo.jpg",
        calories_kcal=420,
        protein_g=38.5,
        carbs_g=22.0,
        fat_g=16.5,
        ai_confidence=0.82,
        ai_provider_type="openai-compatible",
        ai_model_name="test-model",
        ai_raw_json={"foods": ["鸡胸肉", "生菜"]},
    )
    db_session.add(log)
    db_session.commit()
    db_session.refresh(log)

    assert log.id is not None
    assert log.user_id == user.id
    assert log.food_name == "鸡胸肉沙拉"
    assert log.calories_kcal == 420
    assert log.ai_raw_json["foods"] == ["鸡胸肉", "生菜"]


def test_device_metric_model_persists_simulated_heart_rate(db_session):
    user = _user("device-model@example.com")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    metric = DeviceMetric(
        user_id=user.id,
        source="simulated",
        metric_type="heart_rate",
        measured_at=datetime(2026, 6, 7, 8, 30, 0),
        value=128,
        unit="bpm",
        raw_json={"import_batch": "manual-20260607"},
    )
    db_session.add(metric)
    db_session.commit()
    db_session.refresh(metric)

    assert metric.id is not None
    assert metric.user_id == user.id
    assert metric.metric_type == "heart_rate"
    assert metric.value == 128
    assert metric.raw_json["import_batch"] == "manual-20260607"
