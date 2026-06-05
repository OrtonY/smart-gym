from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def register_user(
    db: Session, email: str, password: str, display_name: Optional[str] = None
) -> User:
    existing_user = get_user_by_email(db, email)
    if existing_user is not None:
        raise ValueError("Email is already registered")

    user = User(
        email=email,
        hashed_password=hash_password(password),
        display_name=display_name,
        role="user",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.hashed_password):
        return None
    return user


def create_login_token(user: User) -> str:
    return create_access_token(str(user.id))
