from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.users import UserProfileResponse, UserProfileUpdate
from app.services.user_service import get_user_profile, upsert_user_profile

router = APIRouter()


@router.get("/me/profile")
def read_my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_user_profile(db, current_user.id)
    if profile is None:
        return {}
    return UserProfileResponse.model_validate(profile).model_dump()


@router.put("/me/profile", response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileResponse:
    profile = upsert_user_profile(db, current_user.id, payload)
    return UserProfileResponse.model_validate(profile)
