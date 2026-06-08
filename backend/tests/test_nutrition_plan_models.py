from datetime import date, datetime

from app.models.nutrition_log import NutritionLog
from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion


def test_nutrition_plan_version_and_meal_persist(db_session, create_user_and_token):
    user, _ = create_user_and_token("nutrition-plan-model@example.com")
    plan = NutritionPlan(
        user_id=user.id,
        title="7 day high protein plan",
        source="ai_generated",
        current_version=1,
        is_active=True,
        start_date=date(2026, 6, 7),
        end_date=date(2026, 6, 13),
        days_count=7,
    )
    db_session.add(plan)
    db_session.flush()
    version = NutritionPlanVersion(
        nutrition_plan_id=plan.id,
        version_number=1,
        source="ai_generated",
        user_prompt="Generate 7 days, high protein",
        change_summary="AI generated",
    )
    meal = NutritionPlanMeal(
        nutrition_plan_id=plan.id,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        meal_type="breakfast",
        sort_order=0,
        title="Oats and eggs breakfast",
        food_items=[{"name": "oats", "portion": "50g"}],
        portion_notes="oats 50g, eggs 2",
        target_calories_kcal=450,
        target_protein_g=28.0,
        target_carbs_g=48.0,
        target_fat_g=14.0,
        status="planned",
    )
    db_session.add_all([version, meal])
    db_session.commit()

    saved = db_session.get(NutritionPlanMeal, meal.id)
    saved_plan = db_session.get(NutritionPlan, plan.id)
    saved_version = db_session.get(NutritionPlanVersion, version.id)

    assert saved is not None
    assert saved_plan is not None
    assert saved_plan.title == "7 day high protein plan"
    assert saved_version is not None
    assert saved_version.user_prompt == "Generate 7 days, high protein"
    assert saved.food_items[0]["name"] == "oats"
    assert saved.status == "planned"
    assert saved.actual_calories_kcal == 0


def test_nutrition_log_can_reference_plan_meal(db_session, create_user_and_token):
    user, _ = create_user_and_token("nutrition-log-plan-meal@example.com")
    plan = NutritionPlan(
        user_id=user.id,
        title="Test nutrition plan",
        source="ai_generated",
        current_version=1,
        is_active=True,
        start_date=date(2026, 6, 7),
        end_date=date(2026, 6, 7),
        days_count=1,
    )
    db_session.add(plan)
    db_session.flush()
    meal = NutritionPlanMeal(
        nutrition_plan_id=plan.id,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        meal_type="lunch",
        sort_order=1,
        title="Lunch",
        target_calories_kcal=650,
        status="planned",
    )
    db_session.add(meal)
    db_session.flush()
    log = NutritionLog(
        user_id=user.id,
        nutrition_plan_meal_id=meal.id,
        logged_at=datetime(2026, 6, 7, 12, 0, 0),
        meal_type="lunch",
        food_name="Chicken salad",
        calories_kcal=420,
    )
    db_session.add(log)
    db_session.commit()

    saved = db_session.get(NutritionLog, log.id)

    assert saved is not None
    assert saved.nutrition_plan_meal_id == meal.id
