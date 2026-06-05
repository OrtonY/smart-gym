from __future__ import annotations

import os
from pathlib import Path

from app.core.config import settings


def get_storage_root() -> Path:
    configured_dir = os.getenv("LOCAL_STORAGE_DIR", settings.local_storage_dir)
    root = Path(configured_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def get_storage_path(relative_path: str) -> Path:
    root = get_storage_root()
    path = (root / relative_path).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise ValueError("Storage path must stay inside the storage directory")

    path.parent.mkdir(parents=True, exist_ok=True)
    return path
