import os
import secrets

from fastapi import Header, HTTPException


async def verify_api_key(x_api_key: str = Header(default="")) -> None:
    api_key = os.environ.get("API_KEY", "")
    if not api_key or not secrets.compare_digest(x_api_key, api_key):
        raise HTTPException(status_code=403, detail="Forbidden")
