from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.nutrition_log import NutritionLog
from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion
from app.models.user_profile import UserProfile
from app.schemas.nutrition_plans import (
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)


def _get_owned_plan(db: Session, user_id: int, plan_id: int) -> Optional[NutritionPlan]:
    return (
        db.execute(
            select(NutritionPlan).where(
                NutritionPlan.id == plan_id,
                NutritionPlan.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )


def _deactivate_other_plans(db: Session, user_id: int) -> None:
    plans = db.execute(
        select(NutritionPlan).where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
        )
    ).scalars()
    for plan in plans:
        plan.is_active = False
        plan.updated_at = datetime.utcnow()


def _create_version(
    db: Session,
    plan_id: int,
    version_number: int,
    source: str,
    user_prompt: Optional[str],
    change_summary: Optional[str],
) -> NutritionPlanVersion:
    version = NutritionPlanVersion(
        nutrition_plan_id=plan_id,
        version_number=version_number,
        source=source,
        user_prompt=user_prompt,
        change_summary=change_summary,
    )
    db.add(version)
    return version


def _create_meals(
    db: Session,
    plan_id: int,
    version_number: int,
    meals: list[NutritionPlanMealCreate],
) -> list[NutritionPlanMeal]:
    created = [
        NutritionPlanMeal(
            nutrition_plan_id=plan_id,
            version_number=version_number,
            actual_calories_kcal=0,
            **meal.model_dump(),
        )
        for meal in meals
    ]
    db.add_all(created)
    return created


def create_nutrition_plan(
    db: Session,
    user_id: int,
    payload: NutritionPlanCreate,
    source: str = "manual",
    user_prompt: Optional[str] = None,
) -> NutritionPlan:
    _deactivate_other_plans(db, user_id)
    plan = NutritionPlan(
        user_id=user_id,
        title=payload.title,
        source=source,
        current_version=1,
        is_active=True,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=payload.days_count,
    )
    db.add(plan)
    db.flush()
    _create_version(db, plan.id, 1, source, user_prompt, payload.change_summary)
    _create_meals(db, plan.id, 1, payload.meals)
    db.commit()
    db.refresh(plan)
    return plan


def list_nutrition_plans(db: Session, user_id: int) -> list[NutritionPlan]:
    statement = (
        select(NutritionPlan)
        .where(NutritionPlan.user_id == user_id)
        .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
    )
    return list(db.execute(statement).scalars())


def list_nutrition_plan_versions(
    db: Session, user_id: int, plan_id: int
) -> Optional[list[NutritionPlanVersion]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    statement = (
        select(NutritionPlanVersion)
        .where(NutritionPlanVersion.nutrition_plan_id == plan.id)
        .order_by(desc(NutritionPlanVersion.version_number))
    )
    return list(db.execute(statement).scalars())


def list_nutrition_plan_meals(
    db: Session,
    user_id: int,
    plan_id: int,
    version_number: Optional[int] = None,
) -> Optional[list[NutritionPlanMeal]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    effective_version = version_number or plan.current_version
    statement = (
        select(NutritionPlanMeal)
        .where(
            NutritionPlanMeal.nutrition_plan_id == plan.id,
            NutritionPlanMeal.version_number == effective_version,
        )
        .order_by(
            NutritionPlanMeal.scheduled_date,
            NutritionPlanMeal.sort_order,
            NutritionPlanMeal.id,
        )
    )
    return list(db.execute(statement).scalars())


def get_nutrition_plan_detail(
    db: Session, user_id: int, plan_id: int
) -> Optional[dict[str, object]]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    return {
        "id": plan.id,
        "user_id": plan.user_id,
        "title": plan.title,
        "source": plan.source,
        "current_version": plan.current_version,
        "is_active": plan.is_active,
        "start_date": plan.start_date,
        "end_date": plan.end_date,
        "days_count": plan.days_count,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "items": list_nutrition_plan_meals(db, user_id, plan.id) or [],
        "versions": list_nutrition_plan_versions(db, user_id, plan.id) or [],
    }


def replace_nutrition_plan_meals(
    db: Session,
    user_id: int,
    plan_id: int,
    payload: NutritionPlanMealsReplace,
    source: str = "manual",
) -> Optional[NutritionPlan]:
    plan = _get_owned_plan(db, user_id, plan_id)
    if plan is None:
        return None
    next_version = plan.current_version + 1
    plan.current_version = next_version
    plan.start_date = min(meal.scheduled_date for meal in payload.meals)
    plan.end_date = max(meal.scheduled_date for meal in payload.meals)
    plan.days_count = len({meal.scheduled_date for meal in payload.meals})
    plan.updated_at = datetime.utcnow()
    _create_version(
        db,
        plan.id,
        next_version,
        source,
        payload.user_prompt,
        payload.change_summary,
    )
    _create_meals(db, plan.id, next_version, payload.meals)
    db.commit()
    db.refresh(plan)
    return plan


def user_timezone(db: Session, user_id: int) -> ZoneInfo:
    profile = (
        db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        .scalars()
        .first()
    )
    timezone_name = profile.timezone if profile else "Asia/Shanghai"
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Shanghai")


def local_date_for_log(db: Session, user_id: int, log: NutritionLog) -> date:
    timezone = user_timezone(db, user_id)
    return log.logged_at.replace(tzinfo=timezone).date()


def find_matching_plan_meal(
    db: Session, user_id: int, scheduled_date: date, meal_type: str
) -> Optional[NutritionPlanMeal]:
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == scheduled_date,
            NutritionPlanMeal.meal_type == meal_type,
        )
        .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
    )
    return db.execute(statement).scalars().first()


def status_for_actual(
    target: Optional[int], actual: int, has_logs: bool, final: bool
) -> str:
    if not has_logs:
        return "missed" if final else "planned"
    if target is None or target <= 0:
        return "logged"
    if actual < target * 0.8:
        return "partial"
    if actual > target * 1.2:
        return "over_target"
    return "logged"


def recalculate_meal_actuals(
    db: Session, meal_id: int, final: bool = False
) -> Optional[NutritionPlanMeal]:
    meal = db.get(NutritionPlanMeal, meal_id)
    if meal is None:
        return None
    logs = list(
        db.execute(
            select(NutritionLog).where(NutritionLog.nutrition_plan_meal_id == meal.id)
        ).scalars()
    )
    actual_calories = sum(log.calories_kcal for log in logs)
    meal.actual_calories_kcal = actual_calories
    meal.actual_protein_g = sum(log.protein_g or 0 for log in logs)
    meal.actual_carbs_g = sum(log.carbs_g or 0 for log in logs)
    meal.actual_fat_g = sum(log.fat_g or 0 for log in logs)
    meal.status = status_for_actual(
        meal.target_calories_kcal, actual_calories, bool(logs), final
    )
    meal.last_reconciled_at = datetime.utcnow()
    return meal


def recalculate_day_actuals(
    db: Session, user_id: int, day: date, final: bool = False
) -> list[NutritionPlanMeal]:
    statement = (
        select(NutritionPlanMeal)
        .join(NutritionPlan, NutritionPlan.id == NutritionPlanMeal.nutrition_plan_id)
        .where(
            NutritionPlan.user_id == user_id,
            NutritionPlan.is_active.is_(True),
            NutritionPlanMeal.version_number == NutritionPlan.current_version,
            NutritionPlanMeal.scheduled_date == day,
        )
    )
    meals = list(db.execute(statement).scalars())
    for meal in meals:
        recalculate_meal_actuals(db, meal.id, final=final)
    return meals


def attribute_log_to_plan_meal(
    db: Session, user_id: int, log: NutritionLog
) -> NutritionLog:
    scheduled_date = local_date_for_log(db, user_id, log)
    meal = find_matching_plan_meal(db, user_id, scheduled_date, log.meal_type)
    log.nutrition_plan_meal_id = meal.id if meal is not None else None
    return log


def get_nutrition_summary(
    db: Session, user_id: int, today: Optional[date] = None, days: int = 7
) -> dict[str, object]:
    effective_days = max(1, min(days, 14))
    timezone = user_timezone(db, user_id)
    effective_today = today or datetime.now(timezone).date()
    start_date = effective_today - timedelta(days=effective_days - 1)
    active_plan = (
        db.execute(
            select(NutritionPlan)
            .where(
                NutritionPlan.user_id == user_id,
                NutritionPlan.is_active.is_(True),
            )
            .order_by(desc(NutritionPlan.updated_at), desc(NutritionPlan.id))
        )
        .scalars()
        .first()
    )
    meals = []
    if active_plan is not None:
        meals = list(
            db.execute(
                select(NutritionPlanMeal)
                .where(
                    NutritionPlanMeal.nutrition_plan_id == active_plan.id,
                    NutritionPlanMeal.version_number == active_plan.current_version,
                    NutritionPlanMeal.scheduled_date == effective_today,
                )
                .order_by(NutritionPlanMeal.sort_order, NutritionPlanMeal.id)
            ).scalars()
        )

    logs = list(
        db.execute(
            select(NutritionLog).where(
                NutritionLog.user_id == user_id,
                NutritionLog.logged_at
                >= datetime.combine(start_date, datetime.min.time()),
                NutritionLog.logged_at
                <= datetime.combine(effective_today, datetime.max.time()),
            )
        ).scalars()
    )
    daily = []
    for offset in range(effective_days):
        day = start_date + timedelta(days=offset)
        day_logs = [log for log in logs if log.logged_at.date() == day]
        day_meals = []
        if active_plan is not None:
            day_meals = list(
                db.execute(
                    select(NutritionPlanMeal).where(
                        NutritionPlanMeal.nutrition_plan_id == active_plan.id,
                        NutritionPlanMeal.version_number
                        == active_plan.current_version,
                        NutritionPlanMeal.scheduled_date == day,
                    )
                ).scalars()
            )
        daily.append(
            {
                "date": day,
                "target_calories_kcal": sum(
                    meal.target_calories_kcal or 0 for meal in day_meals
                ),
                "actual_calories_kcal": sum(log.calories_kcal for log in day_logs),
                "actual_protein_g": sum(log.protein_g or 0 for log in day_logs),
                "actual_carbs_g": sum(log.carbs_g or 0 for log in day_logs),
                "actual_fat_g": sum(log.fat_g or 0 for log in day_logs),
                "has_logs": bool(day_logs),
            }
        )
    today_row = daily[-1]
    return {
        "today": {
            "date": effective_today,
            "target_calories_kcal": today_row["target_calories_kcal"],
            "actual_calories_kcal": today_row["actual_calories_kcal"],
            "actual_protein_g": today_row["actual_protein_g"],
            "actual_carbs_g": today_row["actual_carbs_g"],
            "actual_fat_g": today_row["actual_fat_g"],
            "meals": meals,
        },
        "daily": daily,
    }
