import ast
from pathlib import Path

from app.core.database import Base
import app.models as models
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


def test_model_registration_surface_includes_phase2_tables():
    assert "Exercise" in models.__all__
    assert "LeaderboardSnapshot" in models.__all__
    assert "WorkoutMode" in models.__all__
    assert "WorkoutSession" in models.__all__
    assert "exercise_library" in Base.metadata.tables
    assert "leaderboard_snapshots" in Base.metadata.tables
    assert "workout_modes" in Base.metadata.tables
    assert "workout_sessions" in Base.metadata.tables


def test_alembic_env_imports_model_registration_surface_before_metadata():
    env_path = Path("app/migrations/env.py")
    tree = ast.parse(env_path.read_text())

    model_import_lines = [
        node.lineno
        for node in tree.body
        if isinstance(node, ast.Import)
        for alias in node.names
        if alias.name == "app.models"
    ]
    target_metadata_lines = [
        node.lineno
        for node in tree.body
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Name) and target.id == "target_metadata"
    ]

    assert model_import_lines
    assert target_metadata_lines
    assert min(model_import_lines) < min(target_metadata_lines)


def test_user_linked_phase2_foreign_keys_cascade_on_delete():
    session_user_fk = next(
        fk
        for fk in WorkoutSession.__table__.foreign_keys
        if fk.parent.name == "user_id"
    )
    snapshot_user_fk = next(
        fk
        for fk in LeaderboardSnapshot.__table__.foreign_keys
        if fk.parent.name == "user_id"
    )

    assert session_user_fk.ondelete == "CASCADE"
    assert snapshot_user_fk.ondelete == "CASCADE"
