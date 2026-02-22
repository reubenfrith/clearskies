"""Port of agent/src/geotabResolver.ts — Geotab authentication and zone lookup."""

import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Module-level session cache (same pattern as the TypeScript version)
_session: Optional[dict] = None


async def _geotab_call(server: str, method: str, params: dict, credentials: Optional[dict] = None) -> object:
    url = f"https://{server}/apiv1"
    body = {
        "method": method,
        "params": {**params, "credentials": credentials} if credentials else params,
        "id": 1,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=body)
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise RuntimeError(f"Geotab API error [{method}]: {data['error']}")
    return data["result"]


async def authenticate() -> dict:
    global _session

    server = os.environ.get("GEOTAB_SERVER", "my.geotab.com")
    database = os.environ.get("GEOTAB_DATABASE", "")
    username = os.environ.get("GEOTAB_USERNAME", "")
    password = os.environ.get("GEOTAB_PASSWORD", "")

    if not database or not username or not password:
        raise ValueError("GEOTAB_DATABASE, GEOTAB_USERNAME, and GEOTAB_PASSWORD are required")

    result = await _geotab_call(server, "Authenticate", {
        "database": database,
        "userName": username,
        "password": password,
    })

    # Geotab may redirect to a different server
    path = result.get("path", "")
    resolved_server = path if path and path != "ThisServer" else server

    creds = result["credentials"]
    _session = {
        "server": resolved_server,
        "sessionId": creds["sessionId"],
        "userName": creds["userName"],
        "database": creds["database"],
    }

    logger.info(f"[Geotab] Authenticated as {username} on {resolved_server}/{database}")
    return _session


async def _get_session() -> dict:
    global _session
    if not _session:
        return await authenticate()
    return _session


def _normalize_phone(raw: str) -> str:
    """Strip non-digits and return E.164 format for Twilio."""
    digits = "".join(c for c in raw if c.isdigit())
    if digits.startswith("1") and len(digits) == 11:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    return f"+{digits}"


async def _resolve_driver_phones(session: dict, driver_ids: list[str]) -> dict[str, str]:
    """Fetch phone numbers from Geotab User entities."""
    if not driver_ids:
        return {}

    creds = {
        "database": session["database"],
        "userName": session["userName"],
        "sessionId": session["sessionId"],
    }

    phone_map: dict[str, str] = {}
    for driver_id in driver_ids:
        try:
            users = await _geotab_call(
                session["server"],
                "Get",
                {"typeName": "User", "search": {"id": driver_id}},
                creds,
            )
            if users and users[0].get("phoneNumber"):
                phone_map[driver_id] = _normalize_phone(users[0]["phoneNumber"])
        except Exception:
            pass  # Non-fatal: we'll skip unreachable drivers

    return phone_map


async def get_vehicles_in_zone(zone_id: str) -> list[dict]:
    """Return all communicating vehicles currently inside the given Geotab zone."""
    global _session

    session = await _get_session()
    creds = {
        "database": session["database"],
        "userName": session["userName"],
        "sessionId": session["sessionId"],
    }

    try:
        statuses = await _geotab_call(
            session["server"],
            "Get",
            {"typeName": "DeviceStatusInfo", "search": {"zoneId": {"id": zone_id}}},
            creds,
        )
    except Exception as err:
        # Re-authenticate once on session expiry
        err_str = str(err)
        if "InvalidUserException" in err_str or "DbUnavailableException" in err_str:
            _session = None
            session = await authenticate()
            creds = {
                "database": session["database"],
                "userName": session["userName"],
                "sessionId": session["sessionId"],
            }
            statuses = await _geotab_call(
                session["server"],
                "Get",
                {"typeName": "DeviceStatusInfo", "search": {"zoneId": {"id": zone_id}}},
                creds,
            )
        else:
            raise

    # Resolve driver phone numbers
    driver_ids = list({
        s["driver"]["id"]
        for s in statuses
        if s.get("driver") and s["driver"].get("id")
    })
    phone_map = await _resolve_driver_phones(session, driver_ids)

    return [
        {
            "device_id": s["device"]["id"],
            "device_name": s["device"].get("name", ""),
            "driver_name": s["driver"]["name"] if s.get("driver") else None,
            "driver_id": s["driver"]["id"] if s.get("driver") else None,
            "phone_number": phone_map.get(s["driver"]["id"]) if s.get("driver") else None,
            "lat": s.get("latitude", 0),
            "lng": s.get("longitude", 0),
            "speed": s.get("speed", 0),
            "date_time": s.get("dateTime", ""),
        }
        for s in statuses
        if s.get("isDeviceCommunicating")
    ]
