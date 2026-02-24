from fastapi import Header, HTTPException
from .geotab import verify_geotab_session


async def get_current_user(
    x_geotab_user: str = Header(default=""),
    x_geotab_session: str = Header(default=""),
    x_geotab_database: str = Header(default=""),
) -> dict:
    if not x_geotab_user or not x_geotab_session or not x_geotab_database:
        raise HTTPException(status_code=401, detail="Missing Geotab session headers")

    return await verify_geotab_session(
        username=x_geotab_user,
        session_id=x_geotab_session,
        database=x_geotab_database,
    )
