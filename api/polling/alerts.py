"""Port of agent/src/alertDispatcher.ts — Twilio SMS alerts."""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from twilio.rest import Client

from api.polling.thresholds import RULE_LABELS

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def _get_client() -> Client:
    global _client
    if not _client:
        sid = os.environ.get("TWILIO_ACCOUNT_SID")
        token = os.environ.get("TWILIO_AUTH_TOKEN")
        if not sid or not token:
            raise ValueError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required")
        _client = Client(sid, token)
    return _client


def _get_from_number() -> str:
    n = os.environ.get("TWILIO_FROM_NUMBER")
    if not n:
        raise ValueError("TWILIO_FROM_NUMBER is required")
    return n


async def _log_notification(pool, data: dict) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO notification_log
              (hold_id, driver_name, phone_number, message_type, sent_at, twilio_sid, status)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
            """,
            data["hold_id"],
            data.get("driver_name"),
            data["phone_number"],
            data["message_type"],
            data["sent_at"],
            data.get("twilio_sid"),
            data.get("status"),
        )


async def send_hold_alerts(
    pool,
    hold_id: str,
    site_name: str,
    rule: str,
    vehicles: list,
    hold_duration_mins: Optional[int] = None,
) -> list[dict]:
    """Send hold SMS to all drivers with phone numbers; log each to notification_log."""
    duration_text = (
        f"Work must stop for at least {hold_duration_mins} minutes."
        if hold_duration_mins is not None
        else "Work must stop until conditions improve."
    )
    now_et = datetime.now(timezone.utc).strftime("%-I:%M %p")

    results: list[dict] = []
    for v in vehicles:
        if not v.get("phone_number"):
            logger.warning(
                f"[SMS] No phone number for {v.get('driver_name') or v.get('device_name')} — skipping"
            )
            continue

        body = (
            f"\u26a0\ufe0f WORK HOLD \u2014 {site_name}\n"
            f"Reason: {RULE_LABELS.get(rule, rule)}\n"
            f"{duration_text}\n"
            f"Vehicle: {v['device_name']}\n"
            f"Issued by ClearSkies at {now_et} UTC"
        )

        try:
            msg = _get_client().messages.create(
                body=body,
                from_=_get_from_number(),
                to=v["phone_number"],
            )
            rec = {
                "driver_name": v.get("driver_name"),
                "phone_number": v["phone_number"],
                "message_type": "hold",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "twilio_sid": msg.sid,
                "status": msg.status,
            }
            await _log_notification(pool, {"hold_id": hold_id, **rec})
            results.append(rec)
            logger.info(
                f"[SMS] Hold sent to {v.get('driver_name') or v['device_name']} ({v['phone_number']}) \u2014 {msg.sid}"
            )
        except Exception as err:
            logger.error(f"[SMS] Failed to send hold to {v['phone_number']}: {err}")

    return results


async def send_all_clear_alerts(
    pool,
    hold_id: str,
    site_name: str,
    rule: str,
    vehicles: list,
) -> list[dict]:
    """Send all-clear SMS to all drivers who were on site; log each to notification_log."""
    results: list[dict] = []
    for v in vehicles:
        if not v.get("phone_number"):
            continue

        body = (
            f"\u2705 ALL CLEAR \u2014 {site_name}\n"
            f"{RULE_LABELS.get(rule, rule)} conditions have passed.\n"
            f"Work may resume. Please confirm with your site supervisor.\n"
            f"Vehicle: {v['device_name']}"
        )

        try:
            msg = _get_client().messages.create(
                body=body,
                from_=_get_from_number(),
                to=v["phone_number"],
            )
            rec = {
                "driver_name": v.get("driver_name"),
                "phone_number": v["phone_number"],
                "message_type": "all_clear",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "twilio_sid": msg.sid,
                "status": msg.status,
            }
            await _log_notification(pool, {"hold_id": hold_id, **rec})
            results.append(rec)
            logger.info(
                f"[SMS] All-clear sent to {v.get('driver_name') or v['device_name']} ({v['phone_number']}) \u2014 {msg.sid}"
            )
        except Exception as err:
            logger.error(f"[SMS] Failed to send all-clear to {v['phone_number']}: {err}")

    return results
