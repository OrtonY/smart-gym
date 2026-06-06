from app.models.ai_conversation import AiConversation
from app.models.ai_message import AiMessage
from app.models.training_plan import TrainingPlan
from app.models.training_plan_item import TrainingPlanItem
from app.models.training_plan_version import TrainingPlanVersion


def test_phase3_models_have_required_columns():
    assert "user_id" in TrainingPlan.__table__.columns
    assert "current_version" in TrainingPlan.__table__.columns
    assert "training_plan_id" in TrainingPlanVersion.__table__.columns
    assert "version_number" in TrainingPlanVersion.__table__.columns
    assert "scheduled_date" in TrainingPlanItem.__table__.columns
    assert "day_of_week" in TrainingPlanItem.__table__.columns
    assert "exercise_id" in TrainingPlanItem.__table__.columns
    assert "user_id" in AiConversation.__table__.columns
    assert "training_plan_id" in AiConversation.__table__.columns
    assert "conversation_id" in AiMessage.__table__.columns
    assert "provider_type" in AiMessage.__table__.columns
