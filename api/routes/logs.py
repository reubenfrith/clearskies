from fastapi import APIRouter, Depends, Query

from database import get_pool, serialize_rows

router = APIRouter()


@router.get("/logs")
async def list_logs(
    site_id: str | None = None,
    page: int = Query(0, ge=0),
    page_size: int = Query(50, ge=1, le=200),
    pool=Depends(get_pool),
):
    """Return paginated notification log entries ordered by most recent first."""
    offset = page * page_size
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT n.*, h.trigger_rule,
                   COALESCE(s_d.name, s_h.name) AS site_name
            FROM notification_log n
            LEFT JOIN holds_log h ON n.hold_id = h.id
            LEFT JOIN sites s_h ON h.site_id = s_h.id
            LEFT JOIN sites s_d ON n.site_id = s_d.id
            WHERE ($1::uuid IS NULL OR n.site_id = $1::uuid OR h.site_id = $1::uuid)
            ORDER BY n.sent_at DESC
            LIMIT $2 OFFSET $3
            """,
            site_id, page_size, offset,
        )
        total = await conn.fetchval(
            """
            SELECT COUNT(*) FROM notification_log n
            LEFT JOIN holds_log h ON n.hold_id = h.id
            WHERE ($1::uuid IS NULL OR n.site_id = $1::uuid OR h.site_id = $1::uuid)
            """,
            site_id,
        )

    return {"items": serialize_rows(rows), "total": total}
