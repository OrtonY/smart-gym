from __future__ import annotations

import base64
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ai_provider_config import AiProviderConfig
from app.schemas.ai_configs import AiProviderConfigCreate, AiProviderConfigUpdate

_KEY_PREFIX = "dev-key:"


def encrypt_api_key(api_key: str) -> str:
    encoded = base64.urlsafe_b64encode(api_key.encode("utf-8")).decode("ascii")
    return f"{_KEY_PREFIX}{encoded}"


def decrypt_api_key(api_key_encrypted: str) -> str:
    if not api_key_encrypted.startswith(_KEY_PREFIX):
        raise ValueError("Unsupported API key format")
    encoded = api_key_encrypted[len(_KEY_PREFIX) :]
    return base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8")


def list_ai_provider_configs(db: Session, user_id: int) -> List[AiProviderConfig]:
    return list(
        db.execute(
            select(AiProviderConfig).where(AiProviderConfig.user_id == user_id)
        ).scalars()
    )


def get_ai_provider_config(
    db: Session, user_id: int, config_id: int
) -> Optional[AiProviderConfig]:
    return (
        db.execute(
            select(AiProviderConfig).where(
                AiProviderConfig.id == config_id,
                AiProviderConfig.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )


def create_ai_provider_config(
    db: Session, user_id: int, payload: AiProviderConfigCreate
) -> AiProviderConfig:
    config = AiProviderConfig(
        user_id=user_id,
        provider_type=payload.provider_type,
        base_url=payload.base_url,
        model_name=payload.model_name,
        api_key_encrypted=encrypt_api_key(payload.api_key),
        is_active=payload.is_active,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def update_ai_provider_config(
    db: Session, user_id: int, config_id: int, payload: AiProviderConfigUpdate
) -> Optional[AiProviderConfig]:
    config = get_ai_provider_config(db, user_id, config_id)
    if config is None:
        return None

    data = payload.model_dump(exclude_unset=True)
    api_key = data.pop("api_key", None)
    for field, value in data.items():
        setattr(config, field, value)
    if api_key is not None:
        config.api_key_encrypted = encrypt_api_key(api_key)

    db.commit()
    db.refresh(config)
    return config


def delete_ai_provider_config(db: Session, user_id: int, config_id: int) -> bool:
    config = get_ai_provider_config(db, user_id, config_id)
    if config is None:
        return False

    db.delete(config)
    db.commit()
    return True
