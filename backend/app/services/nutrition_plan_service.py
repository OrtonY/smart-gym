from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.nutrition_plan import NutritionPlan
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.nutrition_plan_version import NutritionPlanVersion
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
