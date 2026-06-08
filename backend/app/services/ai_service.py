from __future__ import annotations

import base64
import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any, Optional

from ollama import Client as OllamaClient
from ollama import ResponseError as OllamaResponseError
from openai import APIError as OpenAIAPIError
from openai import OpenAI
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.models.ai_provider_config import AiProviderConfig
from app.models.exercise import Exercise
from app.models.nutrition_plan_meal import NutritionPlanMeal
from app.models.pose_detection_result import PoseDetectionResult
from app.models.training_plan import TrainingPlan
from app.schemas.ai_coach import AdjustTrainingPlanRequest, GenerateTrainingPlanRequest
from app.schemas.nutrition_plans import (
    AdjustNutritionPlanRequest,
    GenerateNutritionPlanRequest,
    NutritionPlanCreate,
    NutritionPlanMealCreate,
    NutritionPlanMealsReplace,
)
from app.schemas.training_plans import (
    TrainingPlanCreate,
    TrainingPlanItemCreate,
    TrainingPlanItemsReplace,
)
from app.services.ai_config_service import decrypt_api_key
from app.services.ai_conversation_service import (
    get_user_conversation,
    list_conversation_messages,
)
from app.services.nutrition_plan_service import (
    create_nutrition_plan,
    get_nutrition_plan_detail,
    replace_nutrition_plan_meals,
)
from app.services.training_plan_service import (
    create_training_plan,
    get_training_plan_detail,
    replace_training_plan_items,
)


class AiCoachError(ValueError):
    pass


AI_PLAN_SYSTEM_PROMPT = (
    "Return only JSON with keys title and items. Each item must include "
    "scheduled_date as YYYY-MM-DD when a concrete date is known. Do not include "
    "rest days as items. For every training item include sort_order, title, sets, "
    "reps, duration_minutes, notes, exercise_id null, workout_mode_id null. "
    "Do not calculate weekdays. day_of_week is optional; the backend will calculate "
    "it from scheduled_date."
)

POSE_ADVICE_SYSTEM_PROMPT = (
    "You are a fitness movement coach. Return concise Chinese advice only. "
    "Use 3 short sentences at most. Focus on movement safety, one correction, "
    "and one next-set cue. Do not mention private data or provider metadata."
)

FOOD_RECOGNITION_SYSTEM_PROMPT = (
    "You are a nutrition assistant. Return only JSON with keys food_name, "
    "description, calories_kcal, protein_g, carbs_g, fat_g, confidence. "
    "Use Chinese for food_name and description. Estimate one meal portion. "
    "If uncertain, lower confidence but still return numeric calorie and macro estimates."
)

NUTRITION_PLAN_SYSTEM_PROMPT = (
    "Return only JSON with keys title, start_date, days_count, change_summary, meals. "
    "days_count must be 1-14. meals must include one breakfast, lunch, dinner, and snack "
    "per day. Each meal must include scheduled_date as YYYY-MM-DD, meal_type, sort_order, "
    "title, food_items array, portion_notes, target_calories_kcal, target_protein_g, "
    "target_carbs_g, target_fat_g, notes. meal_type must be one of breakfast, lunch, "
    "dinner, snack. food_items must be objects with name and optional portion. "
    "Use Chinese for titles and notes."
)

MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"]


def get_active_ai_provider_config(
    db: Session, user_id: int
) -> Optional[AiProviderConfig]:
    return (
        db.execute(
            select(AiProviderConfig)
            .where(
                AiProviderConfig.user_id == user_id,
                AiProviderConfig.is_active.is_(True),
            )
            .order_by(AiProviderConfig.id)
        )
        .scalars()
        .first()
    )


def _fake_items(prompt: str) -> list[TrainingPlanItemCreate]:
    upper_focus = "力量" if "力量" in prompt else "综合"
    return [
        TrainingPlanItemCreate(
            day_of_week=1,
            sort_order=0,
            title=f"{upper_focus}训练",
            sets=4,
            reps=10,
            duration_minutes=None,
            notes="保持动作稳定，组间休息 60 秒",
        ),
        TrainingPlanItemCreate(
            day_of_week=3,
            sort_order=0,
            title="有氧恢复",
            sets=None,
            reps=None,
            duration_minutes=30,
            notes="中低强度，保持可交谈配速",
        ),
        TrainingPlanItemCreate(
            day_of_week=5,
            sort_order=0,
            title="核心训练",
            sets=3,
            reps=15,
            duration_minutes=None,
            notes="控制呼吸，避免腰部代偿",
        ),
    ]


def _strip_json_fence(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.IGNORECASE).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
    return stripped


def _parse_optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def _parse_optional_positive_int(value: Any) -> Optional[int]:
    parsed = _parse_optional_int(value)
    if parsed is None or parsed < 1:
        return None
    return parsed


def _parse_optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"\d+(?:\.\d+)?", str(value))
    return float(match.group(0)) if match else None


def _parse_optional_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    normalized = str(value).strip()
    if normalized.lower() in {"null", "none", "无"}:
        return None

    try:
        return date.fromisoformat(normalized.split("T", maxsplit=1)[0])
    except ValueError:
        pass

    match = re.search(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", normalized)
    if match:
        year, month, day = (int(part) for part in match.groups())
        return date(year, month, day)
    return None


def _parse_day_of_week(value: Any) -> int:
    if isinstance(value, int):
        return value

    normalized = str(value).strip().lower()
    day_map = {
        "monday": 1,
        "mon": 1,
        "周一": 1,
        "星期一": 1,
        "tuesday": 2,
        "tue": 2,
        "周二": 2,
        "星期二": 2,
        "wednesday": 3,
        "wed": 3,
        "周三": 3,
        "星期三": 3,
        "thursday": 4,
        "thu": 4,
        "周四": 4,
        "星期四": 4,
        "friday": 5,
        "fri": 5,
        "周五": 5,
        "星期五": 5,
        "saturday": 6,
        "sat": 6,
        "周六": 6,
        "星期六": 6,
        "sunday": 7,
        "sun": 7,
        "周日": 7,
        "周天": 7,
        "星期日": 7,
        "星期天": 7,
    }
    if normalized in day_map:
        return day_map[normalized]

    parsed = _parse_optional_int(value)
    if parsed is None:
        raise AiCoachError("AI coach returned invalid day_of_week")
    return parsed


def _first_present(raw_item: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in raw_item:
            return raw_item[key]
    return None


def _normalize_notes(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _normalize_raw_item(raw_item: Any, sort_order: int) -> dict[str, Any]:
    if not isinstance(raw_item, dict):
        raise AiCoachError("AI coach returned invalid training item")

    title = raw_item.get("title") or raw_item.get("name") or raw_item.get("exercise")
    if not title:
        raise AiCoachError("AI coach returned training item without title")

    scheduled_date = _parse_optional_date(
        _first_present(raw_item, ["scheduled_date", "date", "training_date"])
    )
    day_value = _first_present(
        raw_item, ["day_of_week", "weekday", "week_day", "dayOfWeek", "day"]
    )
    day_of_week = (
        scheduled_date.isoweekday()
        if day_value in {None, ""}
        and scheduled_date is not None
        else _parse_day_of_week(day_value)
    )

    return {
        "day_of_week": day_of_week,
        "scheduled_date": scheduled_date,
        "sort_order": _parse_optional_int(raw_item.get("sort_order")) or sort_order,
        "exercise_id": _parse_optional_positive_int(raw_item.get("exercise_id")),
        "workout_mode_id": _parse_optional_positive_int(raw_item.get("workout_mode_id")),
        "title": str(title),
        "sets": _parse_optional_positive_int(raw_item.get("sets")),
        "reps": _parse_optional_positive_int(raw_item.get("reps")),
        "duration_minutes": _parse_optional_positive_int(
            raw_item.get("duration_minutes")
        ),
        "notes": _normalize_notes(raw_item.get("notes")),
    }


def _parse_ai_plan_content(content: str) -> tuple[str, list[TrainingPlanItemCreate]]:
    try:
        data = json.loads(_strip_json_fence(content))
    except (TypeError, json.JSONDecodeError) as exc:
        raise AiCoachError("AI coach returned invalid plan JSON") from exc

    title = str(data.get("title") or "AI 训练课表")
    raw_items = data.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        raise AiCoachError("AI coach returned no training items")

    try:
        items = [
            TrainingPlanItemCreate.model_validate(
                _normalize_raw_item(item, sort_order=index)
            )
            for index, item in enumerate(raw_items)
        ]
    except ValueError as exc:
        raise AiCoachError("AI coach returned invalid training items") from exc
    return title, items


def _call_openai_compatible(
    config: AiProviderConfig, prompt: str
) -> tuple[str, list[TrainingPlanItemCreate]]:
    base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
    api_key = decrypt_api_key(config.api_key_encrypted)
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=60.0,
        max_retries=0,
    )
    try:
        response = client.chat.completions.create(
            model=config.model_name,
            messages=[
                {
                    "role": "system",
                    "content": AI_PLAN_SYSTEM_PROMPT,
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
        )
        content = response.choices[0].message.content
    except OpenAIAPIError as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, IndexError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str):
        raise AiCoachError("AI provider returned invalid response")
    return _parse_ai_plan_content(content)


def _call_ollama(
    config: AiProviderConfig, prompt: str
) -> tuple[str, list[TrainingPlanItemCreate]]:
    base_url = (config.base_url or "http://127.0.0.1:11434").rstrip("/")
    client = OllamaClient(host=base_url, timeout=60.0)
    try:
        response = client.chat(
            model=config.model_name,
            messages=[
                {
                    "role": "system",
                    "content": AI_PLAN_SYSTEM_PROMPT,
                },
                {"role": "user", "content": prompt},
            ],
        )
        content = response.message.content
    except (OllamaResponseError, ConnectionError, OSError) as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str):
        raise AiCoachError("AI provider returned invalid response")
    return _parse_ai_plan_content(content)


def generate_training_plan_items(
    config: AiProviderConfig, prompt: str
) -> tuple[str, list[TrainingPlanItemCreate]]:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return "AI 训练课表", _fake_items(prompt)

    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        return _call_openai_compatible(config, prompt)
    if config.provider_type == "ollama":
        return _call_ollama(config, prompt)

    raise AiCoachError("Unsupported AI provider")


def _weekday_for_date(value: date) -> int:
    return value.isoweekday()


def _date_range(center: date) -> list[date]:
    return [center + timedelta(days=offset) for offset in range(-3, 4)]


def _item_date(item: Any, target_range: list[date]) -> Optional[date]:
    scheduled_date = getattr(item, "scheduled_date", None)
    if scheduled_date is not None:
        return scheduled_date

    day_of_week = getattr(item, "day_of_week", None)
    for candidate in target_range:
        if day_of_week == _weekday_for_date(candidate):
            return candidate
    return None


def _item_to_create(item: Any) -> TrainingPlanItemCreate:
    return TrainingPlanItemCreate(
        scheduled_date=getattr(item, "scheduled_date", None),
        day_of_week=getattr(item, "day_of_week"),
        sort_order=getattr(item, "sort_order", 0),
        exercise_id=getattr(item, "exercise_id", None),
        workout_mode_id=getattr(item, "workout_mode_id", None),
        title=getattr(item, "title"),
        sets=getattr(item, "sets", None),
        reps=getattr(item, "reps", None),
        duration_minutes=getattr(item, "duration_minutes", None),
        notes=getattr(item, "notes", None),
    )


def _assign_dates_to_ai_items(
    items: list[TrainingPlanItemCreate], target_range: list[date]
) -> list[TrainingPlanItemCreate]:
    next_items: list[TrainingPlanItemCreate] = []
    for item in items:
        data = item.model_dump()
        if data["scheduled_date"] is None:
            matching_date = next(
                (
                    candidate
                    for candidate in target_range
                    if _weekday_for_date(candidate) == item.day_of_week
                ),
                target_range[3],
            )
            data["scheduled_date"] = matching_date
            data["day_of_week"] = _weekday_for_date(matching_date)
        next_items.append(TrainingPlanItemCreate.model_validate(data))
    return next_items


def _context_for_target_date(current_items: list[Any], target_date: date) -> str:
    target_range = _date_range(target_date)
    lines = []
    for candidate in target_range:
        day_items = [
            item
            for item in current_items
            if _item_date(item, target_range) == candidate
        ]
        if day_items:
            summary = "；".join(
                f"{item.title}"
                f"{f' {item.duration_minutes}分钟' if item.duration_minutes else ''}"
                for item in day_items
            )
        else:
            summary = "休息"
        lines.append(f"{candidate.isoformat()}: {summary}")
    return "\n".join(lines)


def _create_message(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    config: Optional[AiProviderConfig] = None,
    metadata_json: Optional[dict[str, Any]] = None,
) -> AiMessage:
    message = AiMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        provider_type=config.provider_type if config is not None else None,
        model_name=config.model_name if config is not None else None,
        metadata_json=metadata_json,
    )
    db.add(message)
    return message


def _latest_plan_conversation(
    db: Session, user_id: int, plan_id: int
) -> Optional[AiConversation]:
    return (
        db.execute(
            select(AiConversation)
            .where(
                AiConversation.user_id == user_id,
                AiConversation.training_plan_id == plan_id,
                AiConversation.topic == "training_plan",
            )
            .order_by(desc(AiConversation.updated_at), desc(AiConversation.id))
        )
        .scalars()
        .first()
    )


def _conversation_history_text(
    db: Session, conversation_id: int, user_id: Optional[int] = None
) -> str:
    messages = list_conversation_messages(db, conversation_id, user_id=user_id)
    if not messages:
        return ""
    lines = [f"{message.role}: {message.content}" for message in messages[-12:]]
    return "\n".join(lines)


def _select_training_conversation(
    db: Session,
    user_id: int,
    plan_id: int,
    conversation_id: Optional[int],
) -> Optional[AiConversation]:
    if conversation_id is not None:
        return get_user_conversation(
            db,
            user_id,
            conversation_id,
            "training_plan",
            training_plan_id=plan_id,
        )
    return _latest_plan_conversation(db, user_id, plan_id)


def _select_nutrition_conversation(
    db: Session,
    user_id: int,
    plan_id: int,
    conversation_id: Optional[int],
) -> Optional[AiConversation]:
    if conversation_id is not None:
        return get_user_conversation(
            db,
            user_id,
            conversation_id,
            "nutrition_plan",
            nutrition_plan_id=plan_id,
        )
    return _latest_nutrition_plan_conversation(db, user_id, plan_id)


def _fake_pose_advice(result: PoseDetectionResult) -> str:
    score_text = f"{result.score:.1f}" if result.score is not None else "未评分"
    return (
        f"动作建议：本次完成 {result.reps_counted} 次，评分 {score_text}。"
        "保持膝盖朝脚尖方向，起身时收紧核心。下一组放慢下放速度。"
    )


def _pose_advice_user_prompt(
    result: PoseDetectionResult, exercise: Optional[Exercise]
) -> str:
    exercise_name = exercise.name if exercise is not None else "未指定动作"
    return json.dumps(
        {
            "exercise_name": exercise_name,
            "duration_seconds": result.duration_seconds,
            "reps_counted": result.reps_counted,
            "score": result.score,
            "feedback_summary": result.feedback_summary,
            "metrics": result.metrics_json,
        },
        ensure_ascii=False,
        default=str,
    )


def _call_text_openai_compatible(
    config: AiProviderConfig, messages: list[dict[str, str]]
) -> str:
    base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
    api_key = decrypt_api_key(config.api_key_encrypted)
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=60.0,
        max_retries=0,
    )
    try:
        response = client.chat.completions.create(
            model=config.model_name,
            messages=messages,
            temperature=0.3,
        )
        content = response.choices[0].message.content
    except OpenAIAPIError as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, IndexError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return content.strip()


def _call_text_ollama(
    config: AiProviderConfig, messages: list[dict[str, str]]
) -> str:
    base_url = (config.base_url or "http://127.0.0.1:11434").rstrip("/")
    client = OllamaClient(host=base_url, timeout=60.0)
    try:
        response = client.chat(model=config.model_name, messages=messages)
        content = response.message.content
    except (OllamaResponseError, ConnectionError, OSError) as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return content.strip()


def generate_pose_detection_advice(
    config: AiProviderConfig,
    result: PoseDetectionResult,
    exercise: Optional[Exercise],
) -> str:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return _fake_pose_advice(result)

    messages = [
        {"role": "system", "content": POSE_ADVICE_SYSTEM_PROMPT},
        {"role": "user", "content": _pose_advice_user_prompt(result, exercise)},
    ]
    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        return _call_text_openai_compatible(config, messages)
    if config.provider_type == "ollama":
        return _call_text_ollama(config, messages)

    raise AiCoachError("Unsupported AI provider")


def _fake_food_recognition(description: str, has_image: bool) -> dict[str, Any]:
    normalized = description.strip()
    food_name = "鸡胸肉沙拉" if "沙拉" in normalized or has_image else "手动描述餐食"
    return {
        "food_name": food_name,
        "description": normalized or "根据图片估算的一份均衡餐食",
        "calories_kcal": 420 if food_name == "鸡胸肉沙拉" else 360,
        "protein_g": 35.0 if food_name == "鸡胸肉沙拉" else 18.0,
        "carbs_g": 28.0,
        "fat_g": 14.0,
        "confidence": 0.84 if has_image else 0.62,
    }


def _requested_nutrition_days(prompt: str) -> int:
    match = re.search(r"(\d+)\s*(?:天|day|days)", prompt, flags=re.IGNORECASE)
    if match is None:
        return 7
    days = int(match.group(1))
    if days < 1 or days > 14:
        raise AiCoachError("Nutrition plan days must be between 1 and 14")
    return days


def _fake_nutrition_plan(
    prompt: str, start_date: date
) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    days = _requested_nutrition_days(prompt)
    meals: list[NutritionPlanMealCreate] = []
    templates = {
        "breakfast": ("燕麦鸡蛋早餐", 450, 28.0, 48.0, 14.0),
        "lunch": ("鸡胸糙米午餐", 650, 42.0, 72.0, 18.0),
        "dinner": ("清淡鱼肉晚餐", 560, 38.0, 45.0, 16.0),
        "snack": ("酸奶坚果加餐", 220, 14.0, 18.0, 10.0),
    }
    for offset in range(days):
        scheduled_date = start_date + timedelta(days=offset)
        for sort_order, meal_type in enumerate(MEAL_TYPES):
            title, calories, protein, carbs, fat = templates[meal_type]
            meals.append(
                NutritionPlanMealCreate(
                    scheduled_date=scheduled_date,
                    meal_type=meal_type,
                    sort_order=sort_order,
                    title=title,
                    food_items=[{"name": title, "portion": "1 serving"}],
                    portion_notes="按一人份估算，可按饱腹感微调",
                    target_calories_kcal=calories,
                    target_protein_g=protein,
                    target_carbs_g=carbs,
                    target_fat_g=fat,
                    notes="少油烹饪，优先选择天然食材",
                )
            )
    return "AI 饮食计划", days, meals, "AI 生成"


def _bounded_float(value: Any, upper: float) -> Optional[float]:
    parsed = _parse_optional_float(value)
    if parsed is None:
        return None
    return max(0.0, min(parsed, upper))


def _bounded_int(value: Any, upper: int) -> int:
    parsed = _parse_optional_int(value)
    if parsed is None:
        return 0
    return max(0, min(parsed, upper))


def _parse_food_recognition_content(content: str) -> dict[str, Any]:
    try:
        data = json.loads(_strip_json_fence(content))
    except (TypeError, json.JSONDecodeError) as exc:
        raise AiCoachError("AI provider returned invalid food JSON") from exc
    if not isinstance(data, dict):
        raise AiCoachError("AI provider returned invalid food JSON")

    food_name = data.get("food_name") or data.get("name") or data.get("food")
    if not food_name:
        raise AiCoachError("AI provider returned food without name")

    confidence = _bounded_float(data.get("confidence"), 1.0)
    return {
        "food_name": str(food_name)[:160],
        "description": _normalize_notes(data.get("description")),
        "calories_kcal": _bounded_int(
            data.get("calories_kcal") or data.get("calories"), 10_000
        ),
        "protein_g": _bounded_float(data.get("protein_g") or data.get("protein"), 1_000),
        "carbs_g": _bounded_float(data.get("carbs_g") or data.get("carbs"), 1_000),
        "fat_g": _bounded_float(data.get("fat_g") or data.get("fat"), 1_000),
        "confidence": confidence,
    }


def _normalize_nutrition_meal_type(value: Any) -> Any:
    if value is None:
        return value
    normalized = str(value).strip().lower()
    meal_type_map = {
        "breakfast": "breakfast",
        "morning": "breakfast",
        "morning meal": "breakfast",
        "\u65e9\u9910": "breakfast",
        "\u65e9\u996d": "breakfast",
        "lunch": "lunch",
        "noon": "lunch",
        "midday meal": "lunch",
        "\u5348\u9910": "lunch",
        "\u5348\u996d": "lunch",
        "dinner": "dinner",
        "supper": "dinner",
        "evening meal": "dinner",
        "\u665a\u9910": "dinner",
        "\u665a\u996d": "dinner",
        "snack": "snack",
        "snacks": "snack",
        "extra meal": "snack",
        "\u52a0\u9910": "snack",
        "\u96f6\u98df": "snack",
    }
    return meal_type_map.get(normalized, value)


def _normalize_nutrition_food_items(value: Any) -> list[dict[str, Any]]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [{"name": value}]
    if not isinstance(value, list):
        return []

    items: list[dict[str, Any]] = []
    for raw_item in value[:20]:
        if isinstance(raw_item, dict):
            item = dict(raw_item)
            name = (
                item.get("name")
                or item.get("food_name")
                or item.get("food")
                or item.get("title")
            )
            if name is not None and "name" not in item:
                item["name"] = str(name)
            portion = item.get("portion") or item.get("amount") or item.get("serving")
            if portion is not None and "portion" not in item:
                item["portion"] = str(portion)
            items.append(item)
        elif raw_item is not None:
            name = str(raw_item).strip()
            if name:
                items.append({"name": name})
    return items


def _parse_nutrition_plan_content(
    content: str, fallback_start: date
) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    try:
        data = json.loads(_strip_json_fence(content))
    except (TypeError, json.JSONDecodeError) as exc:
        raise AiCoachError("AI provider returned invalid nutrition plan JSON") from exc
    if not isinstance(data, dict):
        raise AiCoachError("AI provider returned invalid nutrition plan JSON")

    title = str(data.get("title") or "AI 饮食计划")
    raw_days = _parse_optional_int(data.get("days_count")) or 7
    if raw_days < 1 or raw_days > 14:
        raise AiCoachError("Nutrition plan days must be between 1 and 14")
    raw_meals = data.get("meals")
    if not isinstance(raw_meals, list) or not raw_meals:
        raise AiCoachError("AI provider returned no nutrition meals")

    meals: list[NutritionPlanMealCreate] = []
    for index, raw_meal in enumerate(raw_meals):
        if not isinstance(raw_meal, dict):
            raise AiCoachError("AI provider returned invalid nutrition meal")
        normalized = {
            "scheduled_date": raw_meal.get("scheduled_date")
            or raw_meal.get("date")
            or fallback_start.isoformat(),
            "meal_type": _normalize_nutrition_meal_type(raw_meal.get("meal_type")),
            "sort_order": _parse_optional_int(raw_meal.get("sort_order")) or index,
            "title": raw_meal.get("title") or raw_meal.get("name") or "计划餐",
            "food_items": _normalize_nutrition_food_items(raw_meal.get("food_items")),
            "portion_notes": _normalize_notes(raw_meal.get("portion_notes")),
            "target_calories_kcal": _bounded_int(
                raw_meal.get("target_calories_kcal") or raw_meal.get("calories_kcal"),
                10_000,
            ),
            "target_protein_g": _bounded_float(
                raw_meal.get("target_protein_g") or raw_meal.get("protein_g"), 1_000
            ),
            "target_carbs_g": _bounded_float(
                raw_meal.get("target_carbs_g") or raw_meal.get("carbs_g"), 1_000
            ),
            "target_fat_g": _bounded_float(
                raw_meal.get("target_fat_g") or raw_meal.get("fat_g"), 1_000
            ),
            "notes": _normalize_notes(raw_meal.get("notes")),
        }
        try:
            meals.append(NutritionPlanMealCreate.model_validate(normalized))
        except ValueError as exc:
            raise AiCoachError("AI provider returned invalid nutrition meal") from exc

    return title, raw_days, meals, str(data.get("change_summary") or "AI 生成")


def _food_recognition_prompt(
    description: str, has_image: bool, conversation_history: str = ""
) -> str:
    return json.dumps(
        {
            "user_description": description.strip() or None,
            "conversation_history": conversation_history or None,
            "has_image": has_image,
            "instruction": "Estimate the visible food and calories for one meal portion.",
        },
        ensure_ascii=False,
    )


def _image_data_url(image_bytes: bytes, image_mime_type: Optional[str]) -> str:
    mime_type = image_mime_type or "image/jpeg"
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _call_food_openai_compatible(
    config: AiProviderConfig,
    description: str,
    image_bytes: Optional[bytes],
    image_mime_type: Optional[str],
    conversation_history: str = "",
) -> dict[str, Any]:
    base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
    api_key = decrypt_api_key(config.api_key_encrypted)
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=30.0,
        max_retries=0,
    )
    user_prompt = _food_recognition_prompt(
        description,
        image_bytes is not None,
        conversation_history=conversation_history,
    )
    user_content: Any = user_prompt
    if image_bytes is not None:
        user_content = [
            {"type": "text", "text": user_prompt},
            {
                "type": "image_url",
                "image_url": {"url": _image_data_url(image_bytes, image_mime_type)},
            },
        ]

    try:
        response = client.chat.completions.create(
            model=config.model_name,
            messages=[
                {"role": "system", "content": FOOD_RECOGNITION_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
        content = response.choices[0].message.content
    except OpenAIAPIError as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, IndexError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return _parse_food_recognition_content(content)


def _call_food_ollama(
    config: AiProviderConfig,
    description: str,
    image_bytes: Optional[bytes],
    conversation_history: str = "",
) -> dict[str, Any]:
    base_url = (config.base_url or "http://127.0.0.1:11434").rstrip("/")
    client = OllamaClient(host=base_url, timeout=60.0)
    user_message: dict[str, Any] = {
        "role": "user",
        "content": _food_recognition_prompt(
            description,
            image_bytes is not None,
            conversation_history=conversation_history,
        ),
    }
    if image_bytes is not None:
        user_message["images"] = [base64.b64encode(image_bytes).decode("ascii")]
    try:
        response = client.chat(
            model=config.model_name,
            messages=[
                {"role": "system", "content": FOOD_RECOGNITION_SYSTEM_PROMPT},
                user_message,
            ],
        )
        content = response.message.content
    except (OllamaResponseError, ConnectionError, OSError) as exc:
        raise AiCoachError("AI provider request failed") from exc
    except (AttributeError, TypeError, ValueError) as exc:
        raise AiCoachError("AI provider returned invalid response") from exc
    if not isinstance(content, str) or not content.strip():
        raise AiCoachError("AI provider returned invalid response")
    return _parse_food_recognition_content(content)


def generate_food_recognition(
    config: AiProviderConfig,
    description: str,
    image_bytes: Optional[bytes] = None,
    image_mime_type: Optional[str] = None,
    conversation_history: str = "",
) -> dict[str, Any]:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return _fake_food_recognition(description, image_bytes is not None)

    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        return _call_food_openai_compatible(
            config,
            description,
            image_bytes,
            image_mime_type,
            conversation_history=conversation_history,
        )
    if config.provider_type == "ollama":
        return _call_food_ollama(
            config,
            description,
            image_bytes,
            conversation_history=conversation_history,
        )

    raise AiCoachError("Unsupported AI provider")


def record_food_recognition_messages(
    db: Session,
    user_id: int,
    description: str,
    estimate: dict[str, Any],
    config: AiProviderConfig,
    conversation_id: Optional[int] = None,
    conversation: Optional[AiConversation] = None,
) -> AiConversation:
    if conversation is None and conversation_id is not None:
        conversation = get_user_conversation(
            db,
            user_id,
            conversation_id,
            "food_record",
        )
        if conversation is None:
            raise AiCoachError("AI conversation not found")
    if conversation is None:
        conversation = AiConversation(user_id=user_id, topic="food_record")
        db.add(conversation)
        db.flush()
    _create_message(
        db,
        conversation.id,
        "user",
        description or "Image only",
        metadata_json={"action": "recognize_food"},
    )
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(estimate, ensure_ascii=False, default=str),
        config=config,
        metadata_json={"action": "recognize_food"},
    )
    return conversation


def generate_nutrition_plan_items(
    config: AiProviderConfig, prompt: str, start_date: date
) -> tuple[str, int, list[NutritionPlanMealCreate], str]:
    if os.getenv("SMART_GYM_AI_FAKE_RESPONSES") == "true":
        return _fake_nutrition_plan(prompt, start_date)

    messages = [
        {"role": "system", "content": NUTRITION_PLAN_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    if config.provider_type in {"openai", "openai-compatible", "openai_compatible"}:
        content = _call_text_openai_compatible(config, messages)
    elif config.provider_type == "ollama":
        content = _call_text_ollama(config, messages)
    else:
        raise AiCoachError("Unsupported AI provider")
    return _parse_nutrition_plan_content(content, start_date)


def _latest_nutrition_plan_conversation(
    db: Session, user_id: int, plan_id: int
) -> Optional[AiConversation]:
    return (
        db.execute(
            select(AiConversation)
            .where(
                AiConversation.user_id == user_id,
                AiConversation.nutrition_plan_id == plan_id,
                AiConversation.topic == "nutrition_plan",
            )
            .order_by(desc(AiConversation.updated_at), desc(AiConversation.id))
        )
        .scalars()
        .first()
    )


def generate_ai_nutrition_plan(
    db: Session, user_id: int, payload: GenerateNutritionPlanRequest
) -> dict[str, object]:
    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")
    start_date = payload.start_date or date.today()
    days = _requested_nutrition_days(payload.prompt)
    prompt = "\n".join(
        [
            f"Today: {date.today().isoformat()}",
            f"Start date: {start_date.isoformat()}",
            f"Default days: {days}",
            f"User request: {payload.prompt}",
        ]
    )
    title, days_count, meals, change_summary = generate_nutrition_plan_items(
        config, prompt, start_date
    )
    plan = create_nutrition_plan(
        db,
        user_id,
        NutritionPlanCreate(
            title=title,
            start_date=min(meal.scheduled_date for meal in meals),
            end_date=max(meal.scheduled_date for meal in meals),
            days_count=days_count,
            meals=meals,
            change_summary=change_summary,
        ),
        source="ai_generated",
        user_prompt=payload.prompt,
    )
    conversation = AiConversation(
        user_id=user_id,
        topic="nutrition_plan",
        nutrition_plan_id=plan.id,
    )
    db.add(conversation)
    db.flush()
    _create_message(db, conversation.id, "user", payload.prompt)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(
            {"title": title, "items": [meal.model_dump() for meal in meals]},
            ensure_ascii=False,
            default=str,
        ),
        config=config,
        metadata_json={"action": "generate_nutrition_plan"},
    )
    db.commit()
    db.refresh(conversation)
    detail = get_nutrition_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Nutrition plan not found")
    return {"conversation_id": conversation.id, "plan": detail}


def adjust_ai_nutrition_plan(
    db: Session, user_id: int, plan_id: int, payload: AdjustNutritionPlanRequest
) -> Optional[dict[str, object]]:
    existing_detail = get_nutrition_plan_detail(db, user_id, plan_id)
    if existing_detail is None:
        return None
    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")
    selected_conversation = _select_nutrition_conversation(
        db, user_id, plan_id, payload.conversation_id
    )
    if payload.conversation_id is not None and selected_conversation is None:
        raise AiCoachError("AI conversation not found")

    current_items = existing_detail["items"]
    start_date = min(item.scheduled_date for item in current_items)
    current_summary = [
        {
            "scheduled_date": item.scheduled_date.isoformat(),
            "meal_type": item.meal_type,
            "title": item.title,
            "target_calories_kcal": item.target_calories_kcal,
        }
        for item in current_items
    ]
    prompt = json.dumps(
        {
            "current_plan": current_summary,
            "conversation_history": (
                _conversation_history_text(
                    db, selected_conversation.id, user_id=user_id
                )
                if selected_conversation is not None
                else "No previous messages."
            ),
            "user_request": payload.prompt,
            "instruction": "Return the full adjusted meal list, not a patch.",
        },
        ensure_ascii=False,
        default=str,
    )
    _, _, meals, change_summary = generate_nutrition_plan_items(
        config, prompt, start_date
    )
    conversation = selected_conversation
    if conversation is None:
        conversation = AiConversation(
            user_id=user_id,
            topic="nutrition_plan",
            nutrition_plan_id=plan_id,
        )
        db.add(conversation)
        db.flush()
    _create_message(db, conversation.id, "user", payload.prompt)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(
            {"items": [meal.model_dump() for meal in meals]},
            ensure_ascii=False,
            default=str,
        ),
        config=config,
        metadata_json={"action": "adjust_nutrition_plan"},
    )
    plan = replace_nutrition_plan_meals(
        db,
        user_id,
        plan_id,
        NutritionPlanMealsReplace(
            meals=meals,
            change_summary=change_summary,
            user_prompt=payload.prompt,
        ),
        source="ai_adjusted",
    )
    if plan is None:
        return None

    db.refresh(conversation)

    detail = get_nutrition_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Nutrition plan not found")
    return {"conversation_id": conversation.id, "plan": detail}


def generate_ai_training_plan(
    db: Session, user_id: int, payload: GenerateTrainingPlanRequest
) -> dict[str, object]:
    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")

    today = date.today()
    prompt = "\n".join(
        [
            f"Today: {today.isoformat()}.",
            "Use scheduled_date for dates. Do not return weekday values unless a date is not available.",
            "If the user does not specify a duration, generate a 7-day plan starting today.",
            f"User request: {payload.prompt}",
        ]
    )
    title, items = generate_training_plan_items(config, prompt)
    plan = create_training_plan(
        db,
        user_id,
        TrainingPlanCreate(
            title=payload.title or title,
            items=items,
            change_summary="AI 生成",
        ),
        source="ai",
    )

    conversation = AiConversation(
        user_id=user_id,
        topic="training_plan",
        training_plan_id=plan.id,
    )
    db.add(conversation)
    db.flush()
    _create_message(db, conversation.id, "user", payload.prompt)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(
            {"title": payload.title or title, "items": [item.model_dump() for item in items]},
            ensure_ascii=False,
            default=str,
        ),
        config=config,
        metadata_json={"action": "generate_training_plan"},
    )
    db.commit()
    db.refresh(conversation)

    detail = get_training_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Training plan not found")
    return {"conversation_id": conversation.id, "plan": detail}


def adjust_ai_training_plan(
    db: Session, user_id: int, plan_id: int, payload: AdjustTrainingPlanRequest
) -> Optional[dict[str, object]]:
    existing_detail = get_training_plan_detail(db, user_id, plan_id)
    if existing_detail is None:
        return None

    config = get_active_ai_provider_config(db, user_id)
    if config is None:
        raise AiCoachError("AI provider config not found")
    selected_conversation = _select_training_conversation(
        db, user_id, plan_id, payload.conversation_id
    )
    if payload.conversation_id is not None and selected_conversation is None:
        raise AiCoachError("AI conversation not found")
    history_text = (
        _conversation_history_text(db, selected_conversation.id, user_id=user_id)
        if selected_conversation is not None
        else "No previous messages."
    )

    current_items = existing_detail["items"]
    if payload.target_date is not None:
        today = date.today()
        prompt = "\n".join(
            [
                f"Target date: {payload.target_date.isoformat()}",
                f"Today: {today.isoformat()}. Do not modify dates before today.",
                "Backend-provided plan context for target date +/- 3 days:",
                _context_for_target_date(current_items, payload.target_date),
                "Conversation history:",
                history_text,
                f"User request: {payload.message}",
                "Return JSON items for the updated target window. Include scheduled_date as YYYY-MM-DD. Do not return weekday values.",
            ]
        )
    else:
        today = date.today()
        prompt = (
            f"Today: {today.isoformat()}. Do not modify dates before today. "
            "Use scheduled_date for dates. Do not return weekday values. "
            f"Conversation history:\n{history_text}\n"
            f"Current plan items: {[item.title for item in current_items]}. "
            f"Adjustment request: {payload.message}"
        )
    _, items = generate_training_plan_items(config, prompt)

    if payload.target_date is not None:
        target_range = _date_range(payload.target_date)
        preserved_items = [
            _item_to_create(item)
            for item in current_items
            if _item_date(item, target_range) not in set(target_range)
        ]
        items = preserved_items + _assign_dates_to_ai_items(items, target_range)

    conversation = selected_conversation
    if conversation is None:
        conversation = AiConversation(
            user_id=user_id,
            topic="training_plan",
            training_plan_id=plan_id,
        )
        db.add(conversation)
        db.flush()
    _create_message(db, conversation.id, "user", payload.message)
    _create_message(
        db,
        conversation.id,
        "assistant",
        json.dumps(
            {"items": [item.model_dump() for item in items]},
            ensure_ascii=False,
            default=str,
        ),
        config=config,
        metadata_json={"action": "adjust_training_plan"},
    )
    plan = replace_training_plan_items(
        db,
        user_id,
        plan_id,
        TrainingPlanItemsReplace(items=items, change_summary=payload.message),
        source="ai",
    )
    if plan is None:
        return None

    db.refresh(conversation)

    detail = get_training_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Training plan not found")
    return {"conversation_id": conversation.id, "plan": detail}
