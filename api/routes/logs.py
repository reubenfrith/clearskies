from fastapi import APIRouter, Depends, Query, Request

from api.database import get_pool, serialize_rows

router = APIRouter()


@router.get("/logs")
async def list_logs(
    request: Request,
    page: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=200),
    pool=Depends(get_pool),
):
    """Return paginated notification log entries ordered by most recent first."""
    offset = page * page_size
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT n.*, h.trigger_rule, s.name as site_name
            FROM notification_log n
            JOIN holds_log h ON n.hold_id = h.id
            JOIN sites s ON h.site_id = s.id
            ORDER BY n.sent_at DESC
            LIMIT $1 OFFSET $2
            """,
            page_size,
            offset,
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM notification_log")

    return {"items": serialize_rows(rows), "total": total}
