from app.models.exercise import Exercise
from app.services.content_seed import seed_default_training_content


def test_seed_default_training_content_creates_common_pose_exercises(db_session):
    seed_default_training_content(db_session)

    exercises = {
        exercise.slug: exercise
        for exercise in db_session.query(Exercise).order_by(Exercise.slug).all()
    }

    assert {
        "bodyweight-squat",
        "push-up",
        "plank",
        "reverse-lunge",
    }.issubset(exercises)
    assert exercises["bodyweight-squat"].detection_rules["type"] == "squat"
    assert exercises["push-up"].detection_rules["key_angles"]["leftElbow"] == [
        11,
        13,
        15,
    ]
    assert exercises["plank"].detection_rules["mode"] == "hold"
    assert exercises["reverse-lunge"].description


def test_seed_default_training_content_is_idempotent(db_session):
    seed_default_training_content(db_session)
    seed_default_training_content(db_session)

    assert db_session.query(Exercise).filter_by(slug="push-up").count() == 1
