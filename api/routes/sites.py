from fastapi import APIRouter, Depends, HTTPException

from database import get_pool, serialize_row, serialize_rows

router = APIRouter()


@router.get("/sites")
async def list_sites(pool=Depends(get_pool)):
    """Return all active sites ordered by name."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM sites WHERE active = true ORDER BY name"
        )
    return serialize_rows(rows)


@router.get("/sites/{site_id}")
async def get_site(site_id: str, pool=Depends(get_pool)):
    """Return a single site by ID."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sites WHERE id = $1::uuid",
            site_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Site not found")
    return serialize_row(row)
