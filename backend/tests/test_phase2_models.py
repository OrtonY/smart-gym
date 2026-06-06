from app.models.exercise import Exercise
from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.workout_mode import WorkoutMode
from app.models.workout_session import WorkoutSession


def test_phase2_models_have_required_columns():
    assert "code" in WorkoutMode.__table__.columns
    assert "estimated_calories_per_hour" in WorkoutMode.__table__.columns
    assert "slug" in Exercise.__table__.columns
    assert "detection_rules" in Exercise.__table__.columns
    assert "user_id" in WorkoutSession.__table__.columns
    assert "duration_minutes" in WorkoutSession.__table__.columns
    assert "calories_burned" in WorkoutSession.__table__.columns
    assert "display_name" in LeaderboardSnapshot.__table__.columns
    assert "rank" in LeaderboardSnapshot.__table__.columns
