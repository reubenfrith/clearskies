import os
import time

import httpx
from fastapi import HTTPException

_cache: dict[str, tuple[float, dict]] = {}  # session_id → (timestamp, user_info)
CACHE_TTL = 30  # seconds

GEOTAB_API_URL = f"https://{os.environ.get('GEOTAB_SERVER', 'my.geotab.com')}/apiv1"


async def verify_geotab_session(username: str, session_id: str, database: str) -> dict:
    cached = _cache.get(session_id)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            GEOTAB_API_URL,
            json={
                "method": "Get",
                "params": {
                    "typeName": "User",
                    "credentials": {
                        "userName": username,
                        "sessionId": session_id,
                        "database": database,
                    },
                },
            },
            timeout=10,
        )

    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Geotab session")
    if "error" in data:
        raise HTTPException(status_code=401, detail="Invalid Geotab session")

    allowed_db = os.environ.get("GEOTAB_DATABASE", "")
    if allowed_db and database != allowed_db:
        raise HTTPException(status_code=403, detail="Forbidden")

    user_info = {"username": username, "database": database}
    _cache[session_id] = (time.time(), user_info)
    return user_info
