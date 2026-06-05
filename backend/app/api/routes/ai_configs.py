from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.ai_configs import (
    AiProviderConfigCreate,
    AiProviderConfigResponse,
    AiProviderConfigUpdate,
)
from app.services.ai_config_service import (
    create_ai_provider_config,
    delete_ai_provider_config,
    list_ai_provider_configs,
    update_ai_provider_config,
)

router = APIRouter()


@router.get("", response_model=list[AiProviderConfigResponse])
def list_my_ai_provider_configs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AiProviderConfigResponse]:
    return list_ai_provider_configs(db, current_user.id)


@router.post(
    "",
    response_model=AiProviderConfigResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_my_ai_provider_config(
    payload: AiProviderConfigCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiProviderConfigResponse:
    return create_ai_provider_config(db, current_user.id, payload)


@router.put("/{config_id}", response_model=AiProviderConfigResponse)
def update_my_ai_provider_config(
    config_id: int,
    payload: AiProviderConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AiProviderConfigResponse:
    config = update_ai_provider_config(db, current_user.id, config_id, payload)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider config not found",
        )
    return config


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_ai_provider_config(
    config_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    deleted = delete_ai_provider_config(db, current_user.id, config_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="AI provider config not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
