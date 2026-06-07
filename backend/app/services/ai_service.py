from __future__ import annotations

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
from app.models.pose_detection_result import PoseDetectionResult
from app.models.training_plan import TrainingPlan
from app.schemas.ai_coach import AdjustTrainingPlanRequest, GenerateTrainingPlanRequest
from app.schemas.training_plans import (
    TrainingPlanCreate,
    TrainingPlanItemCreate,
    TrainingPlanItemsReplace,
)
from app.services.ai_config_service import decrypt_api_key
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
        timeout=30.0,
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
        timeout=30.0,
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

    current_items = existing_detail["items"]
    if payload.target_date is not None:
        today = date.today()
        prompt = "\n".join(
            [
                f"Target date: {payload.target_date.isoformat()}",
                f"Today: {today.isoformat()}. Do not modify dates before today.",
                "Backend-provided plan context for target date +/- 3 days:",
                _context_for_target_date(current_items, payload.target_date),
                f"User request: {payload.message}",
                "Return JSON items for the updated target window. Include scheduled_date as YYYY-MM-DD. Do not return weekday values.",
            ]
        )
    else:
        today = date.today()
        prompt = (
            f"Today: {today.isoformat()}. Do not modify dates before today. "
            "Use scheduled_date for dates. Do not return weekday values. "
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

    plan = replace_training_plan_items(
        db,
        user_id,
        plan_id,
        TrainingPlanItemsReplace(items=items, change_summary=payload.message),
        source="ai",
    )
    if plan is None:
        return None

    conversation = _latest_plan_conversation(db, user_id, plan_id)
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
    db.commit()
    db.refresh(conversation)

    detail = get_training_plan_detail(db, user_id, plan.id)
    if detail is None:
        raise AiCoachError("Training plan not found")
    return {"conversation_id": conversation.id, "plan": detail}
