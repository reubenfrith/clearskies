import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from api.database import get_pool, serialize_row, serialize_rows

router = APIRouter()


class CreateHoldRequest(BaseModel):
    site_id: str
    trigger_rule: str
    issued_by: str
    hold_duration_mins: Optional[int] = None


@router.get("/holds/active")
async def list_active_holds(
    request: Request,
    site_id: Optional[str] = Query(None),
    pool=Depends(get_pool),
):
    """Return open holds (all_clear_at IS NULL), optionally filtered by site."""
    async with pool.acquire() as conn:
        if site_id:
            rows = await conn.fetch(
                """
                SELECT h.*, s.name as site_name
                FROM holds_log h
                JOIN sites s ON h.site_id = s.id
                WHERE h.all_clear_at IS NULL AND h.site_id = $1::uuid
                ORDER BY h.triggered_at DESC
                """,
                site_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT h.*, s.name as site_name
                FROM holds_log h
                JOIN sites s ON h.site_id = s.id
                WHERE h.all_clear_at IS NULL
                ORDER BY h.triggered_at DESC
                """
            )
    return serialize_rows(rows)


@router.get("/holds")
async def list_holds(
    request: Request,
    page: int = Query(0, ge=0),
    page_size: int = Query(25, ge=1, le=100),
    pool=Depends(get_pool),
):
    """Return paginated hold history (all holds, closed and open), joined with site name."""
    offset = page * page_size
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT h.*, s.name as site_name
            FROM holds_log h
            JOIN sites s ON h.site_id = s.id
            ORDER BY h.triggered_at DESC
            LIMIT $1 OFFSET $2
            """,
            page_size,
            offset,
        )
        total = await conn.fetchval("SELECT COUNT(*) FROM holds_log")

    return {"items": serialize_rows(rows), "total": total}


@router.post("/holds", status_code=201)
async def create_hold(body: CreateHoldRequest, request: Request, pool=Depends(get_pool)):
    """Create a manual hold for a site."""
    async with pool.acquire() as conn:
        # Verify the site exists
        site = await conn.fetchrow(
            "SELECT id FROM sites WHERE id = $1::uuid",
            body.site_id,
        )
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")

        row = await conn.fetchrow(
            """
            INSERT INTO holds_log
              (site_id, triggered_at, trigger_rule, weather_snapshot, vehicles_on_site,
               hold_duration_mins, issued_by)
            VALUES ($1::uuid, now(), $2, '{}'::jsonb, '[]'::jsonb, $3, $4)
            RETURNING *
            """,
            body.site_id,
            body.trigger_rule,
            body.hold_duration_mins,
            body.issued_by,
        )
    return serialize_row(row)


@router.patch("/holds/{hold_id}/clear")
async def clear_hold(hold_id: str, request: Request, pool=Depends(get_pool)):
    """Issue an all-clear for a hold (sets all_clear_at = now())."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE holds_log
            SET all_clear_at = now()
            WHERE id = $1::uuid AND all_clear_at IS NULL
            RETURNING *
            """,
            hold_id,
        )
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Hold not found or already cleared",
        )
    return serialize_row(row)
