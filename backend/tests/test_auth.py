import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.deps import require_admin
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.services.auth_service import authenticate_user, ensure_default_admin, register_user


def test_register_login_and_me(client):
    register_response = client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "password": "Passw0rd!",
            "display_name": "训练者",
        },
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "Passw0rd!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "user@example.com"


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_me_rejects_invalid_token(client):
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


def test_me_rejects_expired_token(client, monkeypatch):
    monkeypatch.setattr("app.core.security.settings.access_token_expire_minutes", -1)
    token = create_access_token("1")

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_require_admin_rejects_non_admin(create_user_and_token):
    user, _ = create_user_and_token("member@example.com", role="user")

    with pytest.raises(HTTPException) as exc_info:
        require_admin(user)

    assert exc_info.value.status_code == 403


def test_register_user_rolls_back_duplicate_integrity_error(db_session, monkeypatch):
    rollback_called = False

    def raise_integrity_error():
        raise IntegrityError("insert users", {}, Exception("duplicate email"))

    def record_rollback():
        nonlocal rollback_called
        rollback_called = True

    monkeypatch.setattr(db_session, "commit", raise_integrity_error)
    monkeypatch.setattr(db_session, "rollback", record_rollback)

    with pytest.raises(ValueError, match="Email is already registered"):
        register_user(db_session, "race@example.com", "Passw0rd!", "Racer")

    assert rollback_called is True


def test_ensure_default_admin_creates_loginable_admin(db_session):
    admin = ensure_default_admin(db_session)

    assert admin.email == "admin"
    assert admin.role == "admin"
    assert admin.is_active is True
    assert verify_password("admin123", admin.hashed_password)
    assert authenticate_user(db_session, "admin", "admin123") == admin


def test_ensure_default_admin_is_idempotent_and_preserves_password(db_session):
    admin = ensure_default_admin(db_session)
    original_hash = admin.hashed_password

    second_admin = ensure_default_admin(db_session)
    admin_count = db_session.query(User).filter(User.email == "admin").count()

    assert second_admin.id == admin.id
    assert second_admin.hashed_password == original_hash
    assert admin_count == 1
