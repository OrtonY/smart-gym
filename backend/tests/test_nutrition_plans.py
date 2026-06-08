from datetime import date

from app.models.ai_message import AiMessage
from app.models.ai_provider_config import AiProviderConfig
from app.schemas.nutrition_plans import (
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)
from app.services.ai_config_service import encrypt_api_key
from app.services.nutrition_plan_service import (
    create_nutrition_plan,
    get_nutrition_plan_detail,
    replace_nutrition_plan_meals,
)
from app.services.ai_service import _parse_nutrition_plan_content


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _meal(day: date, meal_type: str, calories: int = 450) -> NutritionPlanMealCreate:
    return NutritionPlanMealCreate(
        scheduled_date=day,
        meal_type=meal_type,
        sort_order=0,
        title=f"{meal_type} test meal",
        food_items=[{"name": "oats", "portion": "50g"}],
        portion_notes="oats 50g",
        target_calories_kcal=calories,
        target_protein_g=25.0,
        target_carbs_g=50.0,
        target_fat_g=12.0,
        notes="low oil",
    )


def test_create_nutrition_plan_deactivates_existing_active_plan(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("nutrition-plan-service@example.com")
    first = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="Old plan",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 6, 7),
            days_count=7,
            meals=[_meal(date(2026, 6, 1), "breakfast")],
            change_summary="Old plan",
        ),
        source="ai_generated",
        user_prompt="Old plan",
    )
    second = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="New plan",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 13),
            days_count=7,
            meals=[_meal(date(2026, 6, 7), "breakfast")],
            change_summary="New plan",
        ),
        source="ai_generated",
        user_prompt="New plan",
    )

    db_session.refresh(first)
    db_session.refresh(second)

    assert first.is_active is False
    assert second.is_active is True


def test_replace_nutrition_plan_meals_creates_new_version(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("nutrition-plan-replace@example.com")
    plan = create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="Nutrition plan",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[_meal(date(2026, 6, 7), "breakfast")],
            change_summary="AI generated",
        ),
        source="ai_generated",
        user_prompt="Generate one day",
    )

    updated = replace_nutrition_plan_meals(
        db_session,
        user.id,
        plan.id,
        NutritionPlanMealsReplace(
            meals=[_meal(date(2026, 6, 7), "lunch", calories=650)],
            change_summary="Breakfast changed to lunch",
            user_prompt="Change to lunch",
        ),
        source="ai_adjusted",
    )
    detail = get_nutrition_plan_detail(db_session, user.id, plan.id)

    assert updated is not None
    assert updated.current_version == 2
    assert detail is not None
    assert len(detail["items"]) == 1
    assert detail["items"][0].version_number == 2
    assert detail["items"][0].meal_type == "lunch"
    assert len(detail["versions"]) == 2


def _provider(user_id: int) -> AiProviderConfig:
    return AiProviderConfig(
        user_id=user_id,
        provider_type="openai-compatible",
        base_url="https://example.test/v1",
        model_name="test-model",
        api_key_encrypted=encrypt_api_key("test-key"),
        is_active=True,
    )


def test_ai_generates_default_seven_day_nutrition_plan(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-default@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "high protein, low oil"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["plan"]["days_count"] == 7
    assert len(data["plan"]["items"]) == 28
    assert data["plan"]["items"][0]["meal_type"] == "breakfast"
    assert data["conversation_id"] > 0


def test_ai_respects_prompt_day_count(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-three@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()

    response = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate 3 days, no milk for breakfast"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["plan"]["days_count"] == 3
    assert len(data["plan"]["items"]) == 12


def test_ai_nutrition_parser_accepts_common_food_item_shapes():
    title, days_count, meals, _ = _parse_nutrition_plan_content(
        """
        {
          "title": "Provider nutrition plan",
          "days_count": 1,
          "change_summary": "Generated",
          "meals": [
            {
              "scheduled_date": "2026-06-08",
              "meal_type": "\\u65e9\\u9910",
              "sort_order": 1,
              "title": "Breakfast",
              "food_items": ["Eggs", "Greek yogurt"],
              "portion_notes": "2 eggs and 150g yogurt",
              "target_calories_kcal": 450,
              "target_protein_g": 35,
              "target_carbs_g": 20,
              "target_fat_g": 22,
              "notes": "High protein"
            }
          ]
        }
        """,
        date(2026, 6, 8),
    )

    assert title == "Provider nutrition plan"
    assert days_count == 1
    assert meals[0].meal_type == "breakfast"
    assert meals[0].food_items == [{"name": "Eggs"}, {"name": "Greek yogurt"}]


def test_ai_adjustment_creates_new_nutrition_plan_version(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-ai-adjust@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    created = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate 3 days"},
    ).json()
    plan_id = created["plan"]["id"]

    response = client.post(
        f"/api/ai-coach/nutrition-plans/{plan_id}/adjust",
        headers=_auth(token),
        json={"prompt": "Make dinner lighter for the next 3 days"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["plan"]["current_version"] == 2
    assert data["plan"]["versions"][0]["user_prompt"] == (
        "Make dinner lighter for the next 3 days"
    )


def test_adjust_nutrition_plan_can_continue_selected_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-continue@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    created = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate 3 days"},
    ).json()
    plan_id = created["plan"]["id"]
    conversation_id = created["conversation_id"]

    response = client.post(
        f"/api/ai-coach/nutrition-plans/{plan_id}/adjust",
        headers=_auth(token),
        json={
            "prompt": "Continue this plan and make dinner lighter",
            "conversation_id": conversation_id,
        },
    )

    assert response.status_code == 200
    assert response.json()["conversation_id"] == conversation_id
    assert (
        db_session.query(AiMessage)
        .filter(AiMessage.conversation_id == conversation_id)
        .count()
        == 4
    )


def test_adjust_nutrition_plan_rejects_mismatched_conversation(
    client, db_session, create_user_and_token, monkeypatch
):
    monkeypatch.setenv("SMART_GYM_AI_FAKE_RESPONSES", "true")
    user, token = create_user_and_token("nutrition-mismatch@example.com")
    db_session.add(_provider(user.id))
    db_session.commit()
    first = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate first 3 days"},
    ).json()
    second = client.post(
        "/api/ai-coach/nutrition-plans/generate",
        headers=_auth(token),
        json={"prompt": "Generate second 3 days"},
    ).json()

    response = client.post(
        f"/api/ai-coach/nutrition-plans/{second['plan']['id']}/adjust",
        headers=_auth(token),
        json={
            "prompt": "Try reusing another plan conversation",
            "conversation_id": first["conversation_id"],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI conversation not found"
