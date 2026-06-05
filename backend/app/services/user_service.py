from __future__ import annotations

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_profile import UserProfile
from app.schemas.users import UserProfileUpdate


def get_user_profile(db: Session, user_id: int) -> Optional[UserProfile]:
    return (
        db.execute(select(UserProfile).where(UserProfile.user_id == user_id))
        .scalar_one_or_none()
    )


def upsert_user_profile(
    db: Session, user_id: int, payload: UserProfileUpdate
) -> UserProfile:
    data = payload.model_dump(exclude_unset=True)
    profile = get_user_profile(db, user_id)

    if profile is None:
        profile = UserProfile(user_id=user_id, **data)
        db.add(profile)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            profile = get_user_profile(db, user_id)
            if profile is None:
                raise RuntimeError(
                    "User profile upsert failed after unique constraint conflict"
                )
            for field, value in data.items():
                setattr(profile, field, value)
            db.commit()
            db.refresh(profile)
            return profile
    else:
        for field, value in data.items():
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile
