from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.exercise import Exercise
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep


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

DEFAULT_WORKOUT_TEMPLATES: list[dict[str, Any]] = [
    {
        "slug": "lower-body-foundation",
        "title": "入门下肢激活",
        "description": "围绕深蹲和弓步的臀腿基础训练，适合建立下肢动作模式。",
        "goal": "strength",
        "difficulty": "beginner",
        "target_muscles": "臀腿、核心",
        "estimated_duration_minutes": 18,
        "cover_url": None,
        "tags": ["lower", "beginner", "bodyweight"],
        "recommendation_weight": 90,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": "bodyweight-squat",
                "title": "徒手深蹲",
                "sets": 3,
                "reps": 12,
                "duration_seconds": None,
                "rest_seconds": 45,
                "instruction": "下蹲时髋部向后坐，起身时收紧臀腿。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "reverse-lunge",
                "title": "反向弓步蹲",
                "sets": 3,
                "reps": 10,
                "duration_seconds": None,
                "rest_seconds": 45,
                "instruction": "每侧 10 次，保持前膝朝脚尖方向。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "plank",
                "title": "平板支撑",
                "sets": 2,
                "reps": None,
                "duration_seconds": 45,
                "rest_seconds": 30,
                "instruction": "肩、髋、踝保持一条直线。",
                "allow_pose_detection": True,
            },
        ],
    },
    {
        "slug": "core-stability",
        "title": "核心稳定训练",
        "description": "以平板支撑为主的短时核心耐力训练。",
        "goal": "strength",
        "difficulty": "beginner",
        "target_muscles": "核心、肩部稳定肌群",
        "estimated_duration_minutes": 12,
        "cover_url": None,
        "tags": ["core", "beginner"],
        "recommendation_weight": 80,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": "plank",
                "title": "平板支撑",
                "sets": 3,
                "reps": None,
                "duration_seconds": 45,
                "rest_seconds": 30,
                "instruction": "保持呼吸稳定，避免塌腰。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "bodyweight-squat",
                "title": "徒手深蹲唤醒",
                "sets": 2,
                "reps": 10,
                "duration_seconds": None,
                "rest_seconds": 30,
                "instruction": "动作放慢，感受核心参与。",
                "allow_pose_detection": True,
            },
        ],
    },
    {
        "slug": "upper-body-basics",
        "title": "上肢力量入门",
        "description": "俯卧撑结合核心稳定，建立上肢推力基础。",
        "goal": "strength",
        "difficulty": "intermediate",
        "target_muscles": "胸肌、肱三头肌、核心",
        "estimated_duration_minutes": 16,
        "cover_url": None,
        "tags": ["upper", "push"],
        "recommendation_weight": 70,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": "push-up",
                "title": "俯卧撑",
                "sets": 4,
                "reps": 8,
                "duration_seconds": None,
                "rest_seconds": 60,
                "instruction": "身体保持一条直线，控制下放。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "plank",
                "title": "平板支撑",
                "sets": 2,
                "reps": None,
                "duration_seconds": 40,
                "rest_seconds": 40,
                "instruction": "稳定肩部和核心。",
                "allow_pose_detection": True,
            },
        ],
    },
    {
        "slug": "full-body-fat-burn",
        "title": "全身燃脂循环",
        "description": "用自重动作组成的全身循环，提高心肺和训练热量消耗。",
        "goal": "fat_loss",
        "difficulty": "intermediate",
        "target_muscles": "全身",
        "estimated_duration_minutes": 24,
        "cover_url": None,
        "tags": ["fat_loss", "full_body"],
        "recommendation_weight": 75,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": "bodyweight-squat",
                "title": "徒手深蹲",
                "sets": 3,
                "reps": 15,
                "duration_seconds": None,
                "rest_seconds": 30,
                "instruction": "保持节奏，不牺牲动作质量。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "push-up",
                "title": "俯卧撑",
                "sets": 3,
                "reps": 8,
                "duration_seconds": None,
                "rest_seconds": 45,
                "instruction": "如有困难可降低次数。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "reverse-lunge",
                "title": "反向弓步蹲",
                "sets": 3,
                "reps": 10,
                "duration_seconds": None,
                "rest_seconds": 45,
                "instruction": "左右交替完成。",
                "allow_pose_detection": True,
            },
        ],
    },
    {
        "slug": "mobility-recovery",
        "title": "拉伸恢复",
        "description": "低强度恢复训练，用基础动作改善身体控制。",
        "goal": "recovery",
        "difficulty": "beginner",
        "target_muscles": "全身、髋部、肩部",
        "estimated_duration_minutes": 10,
        "cover_url": None,
        "tags": ["recovery", "mobility"],
        "recommendation_weight": 60,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": None,
                "title": "动态热身",
                "sets": None,
                "reps": None,
                "duration_seconds": 180,
                "rest_seconds": 20,
                "instruction": "活动肩颈、髋部和脚踝。",
                "allow_pose_detection": False,
            },
            {
                "exercise_slug": "plank",
                "title": "短平板支撑",
                "sets": 2,
                "reps": None,
                "duration_seconds": 30,
                "rest_seconds": 30,
                "instruction": "保持稳定，不追求极限。",
                "allow_pose_detection": True,
            },
        ],
    },
    {
        "slug": "no-equipment-quick",
        "title": "零器械快速训练",
        "description": "无需器械的短时训练，适合碎片时间完成。",
        "goal": "general_fitness",
        "difficulty": "beginner",
        "target_muscles": "全身",
        "estimated_duration_minutes": 14,
        "cover_url": None,
        "tags": ["quick", "bodyweight"],
        "recommendation_weight": 85,
        "is_published": True,
        "steps": [
            {
                "exercise_slug": "bodyweight-squat",
                "title": "徒手深蹲",
                "sets": 2,
                "reps": 15,
                "duration_seconds": None,
                "rest_seconds": 30,
                "instruction": "保持呼吸，不要憋气。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "push-up",
                "title": "俯卧撑",
                "sets": 2,
                "reps": 8,
                "duration_seconds": None,
                "rest_seconds": 40,
                "instruction": "可以跪姿完成。",
                "allow_pose_detection": True,
            },
            {
                "exercise_slug": "plank",
                "title": "平板支撑",
                "sets": 2,
                "reps": None,
                "duration_seconds": 35,
                "rest_seconds": 30,
                "instruction": "保持身体线条稳定。",
                "allow_pose_detection": True,
            },
        ],
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
    db.flush()

    exercises_by_slug = {
        exercise.slug: exercise
        for exercise in db.query(Exercise)
        .filter(Exercise.slug.in_([item["slug"] for item in DEFAULT_EXERCISES]))
        .all()
    }
    for item in DEFAULT_WORKOUT_TEMPLATES:
        steps = item["steps"]
        template_data = {key: value for key, value in item.items() if key != "steps"}
        template = (
            db.query(WorkoutTemplate)
            .filter_by(slug=template_data["slug"])
            .one_or_none()
        )
        if template is None:
            template = WorkoutTemplate(**template_data)
            db.add(template)
            db.flush()
        else:
            for field, value in template_data.items():
                setattr(template, field, value)
            db.query(WorkoutTemplateStep).filter_by(
                workout_template_id=template.id
            ).delete()
            db.flush()

        for sort_order, step in enumerate(steps):
            exercise_slug = step["exercise_slug"]
            exercise = (
                exercises_by_slug.get(exercise_slug) if exercise_slug is not None else None
            )
            db.add(
                WorkoutTemplateStep(
                    workout_template_id=template.id,
                    sort_order=sort_order,
                    exercise_id=exercise.id if exercise else None,
                    workout_mode_id=None,
                    title=step["title"],
                    sets=step["sets"],
                    reps=step["reps"],
                    duration_seconds=step["duration_seconds"],
                    rest_seconds=step["rest_seconds"],
                    instruction=step["instruction"],
                    allow_pose_detection=step["allow_pose_detection"],
                )
            )
    db.commit()
