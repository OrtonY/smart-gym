from datetime import date

from app.schemas.nutrition_plans import NutritionPlanCreate, NutritionPlanMealCreate
from app.services.nutrition_plan_service import create_nutrition_plan


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _meal(day: date, meal_type: str, calories: int):
    return NutritionPlanMealCreate(
        scheduled_date=day,
        meal_type=meal_type,
        sort_order=0,
        title=f"{meal_type} planned",
        target_calories_kcal=calories,
    )


def test_manual_log_auto_links_to_matching_plan_meal(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-link@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="One day plan",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[_meal(date(2026, 6, 7), "lunch", 650)],
        ),
        source="ai_generated",
        user_prompt="Generate one day",
    )

    response = client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-07T12:00:00",
            "meal_type": "lunch",
            "food_name": "Chicken salad",
            "calories_kcal": 620,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["nutrition_plan_meal_id"] is not None


def test_summary_returns_today_and_seven_day_calories(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-summary@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="Plan",
            start_date=date(2026, 6, 7),
            end_date=date(2026, 6, 7),
            days_count=1,
            meals=[
                _meal(date(2026, 6, 7), "breakfast", 450),
                _meal(date(2026, 6, 7), "lunch", 650),
            ],
        ),
        source="ai_generated",
        user_prompt="Generate one day",
    )
    client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-07T08:00:00",
            "meal_type": "breakfast",
            "food_name": "Oats",
            "calories_kcal": 420,
            "protein_g": 20,
            "carbs_g": 50,
            "fat_g": 8,
        },
    )

    response = client.get(
        "/api/nutrition/summary?today=2026-06-07&days=7",
        headers=_auth(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["today"]["actual_calories_kcal"] == 420
    assert data["today"]["target_calories_kcal"] == 1100
    assert len(data["daily"]) == 7
    assert data["daily"][-1]["date"] == "2026-06-07"


def test_reconcile_marks_missed_and_over_target(
    client, db_session, create_user_and_token
):
    user, token = create_user_and_token("nutrition-reconcile@example.com")
    create_nutrition_plan(
        db_session,
        user.id,
        NutritionPlanCreate(
            title="Plan",
            start_date=date(2026, 6, 6),
            end_date=date(2026, 6, 6),
            days_count=1,
            meals=[
                _meal(date(2026, 6, 6), "breakfast", 300),
                _meal(date(2026, 6, 6), "lunch", 500),
            ],
        ),
        source="ai_generated",
        user_prompt="Generate one day",
    )
    client.post(
        "/api/nutrition/logs",
        headers=_auth(token),
        json={
            "logged_at": "2026-06-06T12:00:00",
            "meal_type": "lunch",
            "food_name": "Large rice bowl",
            "calories_kcal": 720,
        },
    )

    response = client.post(
        "/api/nutrition/reconcile",
        headers=_auth(token),
        json={"today": "2026-06-07"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["reconciled_date"] == "2026-06-06"
    assert data["missed_meals"] == 1
    assert data["updated_meals"] == 2
