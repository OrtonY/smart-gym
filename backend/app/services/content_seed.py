from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.exercise import Exercise


DEFAULT_EXERCISES: list[dict[str, Any]] = [
    {
        "slug": "bodyweight-squat",
        "name": "徒手深蹲",
        "target_muscle": "股四头肌、臀大肌、核心",
        "difficulty": "beginner",
        "description": "双脚约与肩同宽站立，髋部向后坐并下蹲，保持膝盖朝脚尖方向，起身时收紧臀腿。适合下肢力量和基础动作模式训练。",
        "tutorial_url": None,
        "media_url": None,
        "detection_rules": {
            "version": 1,
            "type": "squat",
            "display_name": "徒手深蹲",
            "mode": "reps",
            "key_angles": {
                "leftKnee": [23, 25, 27],
                "rightKnee": [24, 26, 28],
            },
            "phase_rules": [
                {
                    "phase": "bottom",
                    "metric": "minKneeAngle",
                    "max": 115,
                    "feedback": "底部深度已达到，保持膝盖朝脚尖方向",
                    "score": 88,
                },
                {
                    "phase": "standing",
                    "metric": "minKneeAngle",
                    "min": 155,
                    "feedback": "站立姿态稳定，准备下一次下放",
                    "score": 94,
                },
            ],
            "default_phase": "moving",
            "default_score": 76,
            "default_feedback": "继续控制速度，保持核心收紧",
            "rep_sequence": ["standing", "bottom", "standing"],
            "scoring": {
                "symmetry": [
                    {
                        "left": "leftKnee",
                        "right": "rightKnee",
                        "penalty_per_degree": 0.5,
                    }
                ]
            },
        },
        "is_published": True,
    },
    {
        "slug": "push-up",
        "name": "俯卧撑",
        "target_muscle": "胸肌、肱三头肌、肩部、核心",
        "difficulty": "intermediate",
        "description": "双手撑地略宽于肩，身体保持一条直线，下放至肘部明显弯曲后推起。适合上肢推力和核心稳定训练。",
        "tutorial_url": None,
        "media_url": None,
        "detection_rules": {
            "version": 1,
            "type": "push_up",
            "display_name": "俯卧撑",
            "mode": "reps",
            "key_angles": {
                "leftElbow": [11, 13, 15],
                "rightElbow": [12, 14, 16],
            },
            "phase_rules": [
                {
                    "phase": "bottom",
                    "metric": "minElbowAngle",
                    "max": 95,
                    "feedback": "下放深度已达到，保持身体成一直线后推起",
                    "score": 88,
                },
                {
                    "phase": "top",
                    "metric": "minElbowAngle",
                    "min": 155,
                    "feedback": "顶端支撑稳定，准备下一次下放",
                    "score": 92,
                },
            ],
            "default_phase": "moving",
            "default_score": 74,
            "default_feedback": "控制下放速度，避免塌腰或耸肩",
            "rep_sequence": ["top", "bottom", "top"],
            "scoring": {
                "symmetry": [
                    {
                        "left": "leftElbow",
                        "right": "rightElbow",
                        "penalty_per_degree": 0.4,
                    }
                ]
            },
        },
        "is_published": True,
    },
    {
        "slug": "plank",
        "name": "平板支撑",
        "target_muscle": "核心、肩部稳定肌群",
        "difficulty": "beginner",
        "description": "前臂或双手支撑身体，肩、髋、踝尽量保持一条直线，避免塌腰或臀部过高。适合核心耐力训练。",
        "tutorial_url": None,
        "media_url": None,
        "detection_rules": {
            "version": 1,
            "type": "plank",
            "display_name": "平板支撑",
            "mode": "hold",
            "key_angles": {
                "leftBodyLine": [11, 23, 27],
                "rightBodyLine": [12, 24, 28],
            },
            "phase_rules": [
                {
                    "phase": "aligned",
                    "metric": "minBodyLineAngle",
                    "min": 160,
                    "feedback": "身体线条稳定，继续保持核心收紧",
                    "score": 92,
                },
                {
                    "phase": "misaligned",
                    "metric": "minBodyLineAngle",
                    "max": 145,
                    "feedback": "调整髋部高度，避免塌腰或臀部过高",
                    "score": 62,
                },
            ],
            "default_phase": "holding",
            "default_score": 78,
            "default_feedback": "保持肩、髋、踝在一条直线上",
            "rep_sequence": [],
            "scoring": {
                "symmetry": [
                    {
                        "left": "leftBodyLine",
                        "right": "rightBodyLine",
                        "penalty_per_degree": 0.3,
                    }
                ]
            },
        },
        "is_published": True,
    },
    {
        "slug": "reverse-lunge",
        "name": "反向弓步蹲",
        "target_muscle": "臀腿、股四头肌、平衡稳定",
        "difficulty": "intermediate",
        "description": "一侧腿向后撤步并下蹲，前腿膝盖保持朝脚尖方向，后腿膝盖向地面靠近，再回到站立。适合单腿力量和平衡训练。",
        "tutorial_url": None,
        "media_url": None,
        "detection_rules": {
            "version": 1,
            "type": "reverse_lunge",
            "display_name": "反向弓步蹲",
            "mode": "reps",
            "key_angles": {
                "leftKnee": [23, 25, 27],
                "rightKnee": [24, 26, 28],
            },
            "phase_rules": [
                {
                    "phase": "bottom",
                    "metric": "minKneeAngle",
                    "max": 115,
                    "feedback": "下蹲深度已达到，保持前膝朝脚尖方向",
                    "score": 86,
                },
                {
                    "phase": "standing",
                    "metric": "minKneeAngle",
                    "min": 155,
                    "feedback": "回到站立，保持身体稳定后换边或继续",
                    "score": 92,
                },
            ],
            "default_phase": "moving",
            "default_score": 74,
            "default_feedback": "控制重心，避免膝盖内扣",
            "rep_sequence": ["standing", "bottom", "standing"],
            "scoring": {},
        },
        "is_published": True,
    },
]


def seed_default_training_content(db: Session) -> None:
    for item in DEFAULT_EXERCISES:
        exercise = db.query(Exercise).filter_by(slug=item["slug"]).one_or_none()
        if exercise is None:
            exercise = Exercise(**item)
            db.add(exercise)
            continue
        for field, value in item.items():
            setattr(exercise, field, value)
    db.commit()
