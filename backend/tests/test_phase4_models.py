from datetime import datetime

from app.models.pose_detection_result import PoseDetectionResult
from app.models.user import User


def test_pose_detection_result_model_persists_private_metrics(db_session):
    user = User(
        email="pose-model@example.com",
        display_name="pose-model",
        hashed_password="hashed",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = PoseDetectionResult(
        user_id=user.id,
        started_at=datetime(2026, 6, 7, 8, 0, 0),
        ended_at=datetime(2026, 6, 7, 8, 2, 0),
        duration_seconds=120,
        reps_counted=10,
        score=84.5,
        feedback_summary="膝盖轨迹稳定",
        metrics_json={"source": "mediapipe_pose_landmarker"},
        landmarks_sample_json={"frames": [{"landmarks": 33}]},
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    assert result.id is not None
    assert result.user_id == user.id
    assert result.reps_counted == 10
    assert result.metrics_json["source"] == "mediapipe_pose_landmarker"
    assert result.ai_advice is None
