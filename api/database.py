import os
import uuid
from datetime import datetime

import asyncpg


async def create_pool() -> asyncpg.Pool:
    url = os.environ["DATABASE_URL"]
    return await asyncpg.create_pool(url)


async def close_pool(pool: asyncpg.Pool) -> None:
    await pool.close()


def get_pool(request):
    """FastAPI dependency — injects the pool from app.state."""
    return request.app.state.pool


def serialize_row(row) -> dict | None:
    """Convert an asyncpg Record to a JSON-serialisable dict."""
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def serialize_rows(rows) -> list[dict]:
    return [serialize_row(r) for r in rows]
