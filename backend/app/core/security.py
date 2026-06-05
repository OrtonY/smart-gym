from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict

from app.core.config import settings


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _json_dumps(data: Dict[str, Any]) -> bytes:
    return json.dumps(data, separators=(",", ":"), sort_keys=True).encode("utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), 210_000
    ).hex()
    return f"pbkdf2_sha256$210000${salt}${password_hash}"


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        algorithm, iterations, salt, expected_hash = hashed_password.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("ascii"),
            int(iterations),
        ).hex()
    except (TypeError, ValueError):
        return False
    return hmac.compare_digest(actual_hash, expected_hash)


def create_access_token(subject: str) -> str:
    now = datetime.utcnow()
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()
        ),
    }
    header = {"alg": settings.jwt_algorithm, "typ": "JWT"}
    if settings.jwt_algorithm != "HS256":
        raise ValueError("Only HS256 JWT tokens are supported")

    signing_input = ".".join(
        [_base64url_encode(_json_dumps(header)), _base64url_encode(_json_dumps(payload))]
    )
    signature = hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"


def decode_access_token(token: str) -> str:
    try:
        token_parts = token.split(".")
        if len(token_parts) != 3:
            raise ValueError("Invalid access token")
        encoded_header, encoded_payload, encoded_signature = token_parts
        signing_input = f"{encoded_header}.{encoded_payload}"
        header = json.loads(_base64url_decode(encoded_header))
        payload = json.loads(_base64url_decode(encoded_payload))
        actual_signature = _base64url_decode(encoded_signature)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
        raise ValueError("Invalid access token")

    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise ValueError("Invalid access token")

    if header.get("alg") != "HS256":
        raise ValueError("Invalid access token")

    expected_signature = hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ValueError("Invalid access token")

    expires_at = payload.get("exp")
    if not isinstance(expires_at, int) or expires_at < int(datetime.utcnow().timestamp()):
        raise ValueError("Access token has expired")

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ValueError("Invalid access token")
    return subject
