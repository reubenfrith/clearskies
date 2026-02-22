"""
Port of agent/src/index.ts — APScheduler polling loop.

Starts an AsyncIOScheduler that calls poll() every POLL_INTERVAL_MINUTES minutes.
Also fires an immediate poll on startup.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from api.polling.weather import fetch_weather
from api.polling.thresholds import evaluate_thresholds, should_clear_hold
from api.polling.geotab import get_vehicles_in_zone, authenticate
from api.polling.alerts import send_hold_alerts, send_all_clear_alerts

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


# ─── Database helpers ─────────────────────────────────────────────────────────

async def _get_active_sites(pool) -> list[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM sites WHERE active = true")
        return [dict(r) for r in rows]


async def _get_active_hold(pool, site_id: str) -> dict | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM holds_log
            WHERE site_id = $1::uuid AND all_clear_at IS NULL
            ORDER BY triggered_at DESC
            LIMIT 1
            """,
            site_id,
        )
        return dict(row) if row else None


async def _create_hold(pool, data: dict) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO holds_log
              (site_id, triggered_at, trigger_rule, weather_snapshot, vehicles_on_site, hold_duration_mins, issued_by)
            VALUES ($1::uuid, now(), $2, $3::jsonb, $4::jsonb, $5, 'auto')
            RETURNING *
            """,
            data["site_id"],
            data["trigger_rule"],
            json.dumps(data["weather_snapshot"]),
            json.dumps(data["vehicles_on_site"]),
            data.get("hold_duration_mins"),
        )
        return dict(row)


async def _close_hold(pool, hold_id: str, notifications: list) -> None:
    import uuid as _uuid
    hold_uuid = hold_id if isinstance(hold_id, _uuid.UUID) else str(hold_id)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE holds_log
            SET all_clear_at = now(), notifications_sent = $2::jsonb
            WHERE id = $1::uuid
            """,
            hold_uuid,
            json.dumps(notifications),
        )


# ─── Site processing ──────────────────────────────────────────────────────────

async def _process_site(pool, site: dict) -> None:
    site_id = str(site["id"])
    site_name = site["name"]
    zone_id = site["geotab_zone_id"]

    # Fetch weather and active hold concurrently
    weather_result, hold_result = await asyncio.gather(
        fetch_weather(site),
        _get_active_hold(pool, site_id),
        return_exceptions=True,
    )

    if isinstance(weather_result, Exception):
        logger.warning(f"[{site_name}] Weather fetch failed — skipping: {weather_result}")
        return

    weather = weather_result
    active_hold = None if isinstance(hold_result, Exception) else hold_result

    breach = evaluate_thresholds(weather)

    if active_hold:
        # ── Active hold: check if we should issue all-clear ───────────────────
        triggered_at = active_hold["triggered_at"]
        if isinstance(triggered_at, str):
            triggered_at = datetime.fromisoformat(triggered_at)

        hold_id = str(active_hold["id"])
        clear = should_clear_hold(
            active_hold["trigger_rule"],
            weather,
            triggered_at,
            active_hold.get("hold_duration_mins"),
        )

        if clear:
            logger.info(f"[{site_name}] Conditions cleared — issuing all-clear for hold {hold_id}")
            vehicles = active_hold["vehicles_on_site"]
            if isinstance(vehicles, str):
                vehicles = json.loads(vehicles)

            notifications = await send_all_clear_alerts(
                pool=pool,
                hold_id=hold_id,
                site_name=site_name,
                rule=active_hold["trigger_rule"],
                vehicles=vehicles,
            )
            await _close_hold(pool, hold_id, notifications)
            logger.info(f"[{site_name}] All-clear issued to {len(notifications)} driver(s)")
        else:
            logger.info(f"[{site_name}] Hold active since {active_hold['triggered_at']} — no change")

    elif breach:
        # ── No active hold + threshold breached: open a new hold ─────────────
        logger.info(
            f"[{site_name}] Threshold breached: {breach['rule']} "
            f"({breach['value']} vs {breach['threshold']})"
        )

        vehicles = await get_vehicles_in_zone(zone_id)
        logger.info(f"[{site_name}] {len(vehicles)} vehicle(s) on site")

        hold = await _create_hold(pool, {
            "site_id": site_id,
            "trigger_rule": breach["rule"],
            "weather_snapshot": weather,
            "vehicles_on_site": vehicles,
            "hold_duration_mins": breach.get("hold_duration_mins"),
        })

        hold_id = str(hold["id"])
        notifications = await send_hold_alerts(
            pool=pool,
            hold_id=hold_id,
            site_name=site_name,
            rule=breach["rule"],
            vehicles=vehicles,
            hold_duration_mins=breach.get("hold_duration_mins"),
        )
        logger.info(f"[{site_name}] Hold {hold_id} created — {len(notifications)} SMS sent")

    else:
        logger.info(
            f"[{site_name}] All clear — "
            f"wind {weather['wind_gust_mph']}mph, "
            f"lightning {weather['lightning_probability_pct']}%, "
            f"heat {weather['apparent_temp_c']}°C"
        )


async def poll(pool) -> None:
    logger.info(f"\n[ClearSkies] Poll started at {datetime.now(timezone.utc).isoformat()}")

    try:
        sites = await _get_active_sites(pool)
    except Exception as err:
        logger.error(f"[ClearSkies] Failed to fetch sites: {err}")
        return

    logger.info(f"[ClearSkies] Monitoring {len(sites)} active site(s)")

    # Process all sites concurrently — failures on one don't block others
    tasks = [_process_site(pool, site) for site in sites]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for site, result in zip(sites, results):
        if isinstance(result, Exception):
            logger.error(f"[{site['name']}] Unhandled error: {result}")

    logger.info("[ClearSkies] Poll complete")


# ─── Scheduler lifecycle ──────────────────────────────────────────────────────

async def start_scheduler(pool) -> None:
    global _scheduler

    interval = int(os.environ.get("POLL_INTERVAL_MINUTES", "5"))
    demo = os.environ.get("DEMO_MODE") == "true"

    logger.info("🌤  ClearSkies monitoring agent starting...")
    logger.info(f"   Poll interval: {interval} min")
    logger.info(f"   Demo mode: {'ON' if demo else 'off'}")

    # Authenticate with Geotab upfront so the first poll is fast
    try:
        await authenticate()
    except Exception as err:
        logger.error(f"[Geotab] Initial authentication failed: {err}")
        logger.error("Check GEOTAB_* env vars. Scheduler will retry on next poll.")

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        poll,
        "interval",
        minutes=interval,
        args=[pool],
        id="poll",
    )
    _scheduler.start()
    logger.info(f"[ClearSkies] Scheduler started — polling every {interval} min")

    # Run immediately on startup
    await poll(pool)


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()
        _scheduler = None
        logger.info("[ClearSkies] Scheduler stopped")
