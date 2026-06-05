from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine, get_db
from app.main import app
from app.models.ai_provider_config import AiProviderConfig
from app.models.user import User
from app.models.user_profile import UserProfile

_models = (AiProviderConfig, User, UserProfile)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def create_user_and_token(db_session: Session):
    def _create_user_and_token(
        email: str = "test@example.com",
        password: str = "Passw0rd!",
        role: str = "user",
    ):
        from app.core.security import create_access_token, hash_password

        user = User(
            email=email,
            display_name=email.split("@")[0],
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        token = create_access_token(str(user.id))
        return user, token

    return _create_user_and_token
