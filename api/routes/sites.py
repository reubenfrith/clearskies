from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_pool, serialize_row, serialize_rows

router = APIRouter()


class SiteCreate(BaseModel):
    name: str
    address: str | None = None
    lat: float
    lng: float
    geotab_zone_id: str
    radius_m: int = 200


@router.get("/sites")
async def list_sites(pool=Depends(get_pool)):
    """Return all active sites ordered by name."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM sites WHERE active = true ORDER BY name"
        )
    return serialize_rows(rows)


@router.post("/sites", status_code=201)
async def create_site(body: SiteCreate, pool=Depends(get_pool)):
    """Register a Geotab zone as a monitored ClearSkies site."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO sites (name, address, lat, lng, geotab_zone_id, radius_m)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (geotab_zone_id) DO UPDATE
              SET name = EXCLUDED.name,
                  address = EXCLUDED.address,
                  radius_m = EXCLUDED.radius_m,
                  active = true
            RETURNING *
            """,
            body.name, body.address, body.lat, body.lng, body.geotab_zone_id, body.radius_m,
        )
    return serialize_row(row)


@router.delete("/sites/{site_id}", status_code=204)
async def deactivate_site(site_id: str, pool=Depends(get_pool)):
    """Deactivate a site (soft-delete, preserves hold history)."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE sites SET active = false WHERE id = $1::uuid",
            site_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Site not found")


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
