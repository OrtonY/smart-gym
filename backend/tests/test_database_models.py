from app.models.ai_provider_config import AiProviderConfig
from app.models.user import User
from app.models.user_profile import UserProfile


def test_models_have_user_isolation_fields():
    assert "id" in User.__table__.columns
    assert "role" in User.__table__.columns
    assert "user_id" in UserProfile.__table__.columns
    assert "user_id" in AiProviderConfig.__table__.columns
