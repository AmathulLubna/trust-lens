"""Server delegation and independently provisioned mobile credentials."""
import hashlib
import hmac
import json
import os
from fastapi import Header, HTTPException
from web_acoustic.config import ACOUSTIC_SERVICE_TOKEN

def user_tokens():
    try:
        values = json.loads(os.environ.get("TRUSTLENS_WEB_USER_TOKEN_HASHES", "{}"))
        if not isinstance(values, dict) or any(not isinstance(k, str) or not 1 <= len(k) <= 128 or
                not isinstance(v, str) or len(v) != 64 or any(c not in "0123456789abcdef" for c in v)
                for k, v in values.items()):
            raise ValueError()
        if len(set(values.values())) != len(values):
            raise ValueError()
        return values
    except (ValueError, TypeError):
        raise HTTPException(503, "User authentication configuration is invalid")

def service_owner(authorization: str = Header(""), x_trustlens_owner: str = Header("")):
    if not authorization.isascii() or not authorization.startswith("Bearer ") or not 1 <= len(authorization[7:]) <= 512:
        raise HTTPException(401, "Not authenticated")
    token = authorization[7:]
    if ACOUSTIC_SERVICE_TOKEN and hmac.compare_digest(token, ACOUSTIC_SERVICE_TOKEN):
        if not x_trustlens_owner or len(x_trustlens_owner) > 128:
            raise HTTPException(400, "Authenticated owner is required")
        return x_trustlens_owner
    digest = hashlib.sha256(token.encode()).hexdigest()
    owner = None
    for candidate, expected in user_tokens().items():
        if hmac.compare_digest(digest, expected):
            owner = candidate
    if owner is None:
        raise HTTPException(401, "Not authenticated")
    return owner
