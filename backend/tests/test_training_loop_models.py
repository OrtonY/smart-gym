from datetime import date, datetime

from app.models.training_plan_item import TrainingPlanItem
from app.models.user_profile import UserProfile
from app.models.workout_session import WorkoutSession
from app.models.workout_session_step import WorkoutSessionStep
from app.models.workout_template import WorkoutTemplate
from app.models.workout_template_step import WorkoutTemplateStep


def test_workout_template_and_step_model(db_session):
    template = WorkoutTemplate(
        slug="lower-body-start",
        title="入门下肢激活",
        goal="strength",
        difficulty="beginner",
        target_muscles="臀腿、核心",
        estimated_duration_minutes=18,
        tags=["lower", "beginner"],
        recommendation_weight=10,
        is_published=True,
    )
    db_session.add(template)
    db_session.flush()
    db_session.add(
        WorkoutTemplateStep(
            workout_template_id=template.id,
            sort_order=0,
            title="徒手深蹲",
            sets=3,
            reps=12,
            duration_seconds=None,
            rest_seconds=45,
            instruction="保持膝盖朝脚尖方向",
            allow_pose_detection=True,
        )
    )
    db_session.commit()

    stored = db_session.query(WorkoutTemplate).filter_by(slug="lower-body-start").one()
    assert stored.tags == ["lower", "beginner"]
    assert db_session.query(WorkoutTemplateStep).count() == 1


def test_plan_item_session_extensions_and_timezone(db_session, create_user_and_token):
    user, _ = create_user_and_token("loop-model@example.com")
    profile = UserProfile(user_id=user.id)
    session = WorkoutSession(
        user_id=user.id,
        started_at=datetime(2026, 6, 7, 9, 0, 0),
        duration_minutes=20,
        calories_burned=120,
        status="completed",
        source_type="plan",
        pose_detection_enabled=True,
        completed_steps_count=1,
        total_steps_count=1,
    )
    db_session.add_all([profile, session])
    db_session.flush()
    item = TrainingPlanItem(
        training_plan_id=1,
        version_number=1,
        scheduled_date=date(2026, 6, 7),
        day_of_week=7,
        title="核心训练",
        sort_order=0,
        entry_type="scheduled",
        status="completed",
        linked_workout_session_id=session.id,
        actual_duration_seconds=1200,
        actual_score=88,
    )
    step = WorkoutSessionStep(
        workout_session_id=session.id,
        sort_order=0,
        title="核心训练",
        planned_duration_seconds=1200,
        actual_duration_seconds=1180,
        status="completed",
        score=88,
    )
    db_session.add_all([item, step])
    db_session.commit()

    assert profile.timezone == "Asia/Shanghai"
    assert item.status == "completed"
    assert step.score == 88
