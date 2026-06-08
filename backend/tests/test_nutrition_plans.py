from datetime import date

from app.schemas.nutrition_plans import (
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)
from app.services.nutrition_plan_service import (
    create_nutrition_plan,
    get_nutrition_plan_detail,
    replace_nutrition_plan_meals,
)


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
