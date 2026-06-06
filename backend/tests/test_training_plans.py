from app.models.exercise import Exercise
from app.models.workout_mode import WorkoutMode
from app.schemas.training_plans import (
    TrainingPlanCreate,
    TrainingPlanItemCreate,
    TrainingPlanItemsReplace,
)
from app.services.training_plan_service import (
    create_training_plan,
    get_training_plan_detail,
    list_training_plan_items,
    list_training_plans,
    replace_training_plan_items,
)


def _item(title: str, day_of_week: int = 1) -> TrainingPlanItemCreate:
    return TrainingPlanItemCreate(
        day_of_week=day_of_week,
        sort_order=0,
        title=title,
        sets=3,
        reps=12,
        duration_minutes=None,
        notes=None,
    )


def test_training_plan_service_isolates_users(db_session, create_user_and_token):
    owner, _ = create_user_and_token("plan-owner@example.com")
    viewer, _ = create_user_and_token("plan-viewer@example.com")
    create_training_plan(
        db_session,
        owner.id,
        TrainingPlanCreate(title="Owner plan", items=[_item("深蹲")]),
    )

    assert len(list_training_plans(db_session, owner.id)) == 1
    assert list_training_plans(db_session, viewer.id) == []


def test_create_training_plan_creates_first_version(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("version-one@example.com")

    plan = create_training_plan(
        db_session,
        user.id,
        TrainingPlanCreate(
            title="力量基础",
            items=[_item("徒手深蹲")],
            change_summary="初始课表",
        ),
    )
    detail = get_training_plan_detail(db_session, user.id, plan.id)

    assert plan.current_version == 1
    assert detail is not None
    assert [item.title for item in detail["items"]] == ["徒手深蹲"]
    assert [version.version_number for version in detail["versions"]] == [1]
    assert detail["versions"][0].change_summary == "初始课表"


def test_replace_training_plan_items_creates_next_version(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("replace-plan@example.com")
    plan = create_training_plan(
        db_session,
        user.id,
        TrainingPlanCreate(title="力量基础", items=[_item("徒手深蹲")]),
    )

    updated = replace_training_plan_items(
        db_session,
        user.id,
        plan.id,
        TrainingPlanItemsReplace(
            items=[_item("俯卧撑", day_of_week=2)],
            change_summary="上肢调整",
        ),
    )
    current_items = list_training_plan_items(db_session, user.id, plan.id)
    original_items = list_training_plan_items(
        db_session, user.id, plan.id, version_number=1
    )
    detail = get_training_plan_detail(db_session, user.id, plan.id)

    assert updated is not None
    assert updated.current_version == 2
    assert current_items is not None
    assert [item.title for item in current_items] == ["俯卧撑"]
    assert original_items is not None
    assert [item.title for item in original_items] == ["徒手深蹲"]
    assert detail is not None
    assert [version.version_number for version in detail["versions"]] == [2, 1]


def test_training_plan_items_validate_references(
    db_session, create_user_and_token
):
    user, _ = create_user_and_token("reference-plan@example.com")
    mode = WorkoutMode(
        code="strength",
        name="力量训练",
        estimated_calories_per_hour=360,
        is_active=True,
    )
    exercise = Exercise(
        slug="bodyweight-squat",
        name="徒手深蹲",
        target_muscle="腿部",
        difficulty="beginner",
        is_published=True,
    )
    db_session.add_all([mode, exercise])
    db_session.commit()
    db_session.refresh(mode)
    db_session.refresh(exercise)

    plan = create_training_plan(
        db_session,
        user.id,
        TrainingPlanCreate(
            title="引用动作",
            items=[
                TrainingPlanItemCreate(
                    day_of_week=1,
                    sort_order=0,
                    exercise_id=exercise.id,
                    workout_mode_id=mode.id,
                    title="徒手深蹲",
                    sets=3,
                    reps=12,
                    duration_minutes=None,
                    notes=None,
                )
            ],
        ),
    )
    items = list_training_plan_items(db_session, user.id, plan.id)

    assert items is not None
    assert items[0].exercise_id == exercise.id
    assert items[0].workout_mode_id == mode.id
