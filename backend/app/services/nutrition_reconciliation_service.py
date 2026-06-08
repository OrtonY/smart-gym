from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.services.nutrition_plan_service import (
    recalculate_meal_actuals,
    user_timezone,
)


def reconcile_nutrition_calendar(
    db: Session, user_id: int, today: Optional[date] = None
) -> dict[str, object]:
    timezone = user_timezone(db, user_id)
    effective_today = today or datetime.now(timezone).date()
    reconciled_date = effective_today - timedelta(days=1)
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == reconciled_date,
        )
    )
    updated = 0
    missed = 0
    for meal in db.execute(statement).scalars():
        recalculate_meal_actuals(db, meal.id, final=True)
        updated += 1
        if meal.status == "missed":
            missed += 1
    db.commit()
    return {
        "updated_meals": updated,
        "missed_meals": missed,
        "reconciled_date": reconciled_date,
    }
