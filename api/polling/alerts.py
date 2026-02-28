"""Geotab TextMessage alerts — replaces Twilio SMS."""

import logging
from datetime import datetime, timezone
from typing import Optional

from polling.geotab import _geotab_call, _get_session
from polling.thresholds import RULE_LABELS

logger = logging.getLogger(__name__)


async def _send_geotab_message(device_id: str, message: str) -> str:
    """Send a TextMessage to a device via the Geotab API; returns the new message id."""
    session = await _get_session()
    creds = {
        "database": session["database"],
        "userName": session["userName"],
        "sessionId": session["sessionId"],
    }
    result = await _geotab_call(
        session["server"],
        "Add",
        {
            "typeName": "TextMessage",
            "entity": {
                "device": {"id": device_id},
                "isDirectionToVehicle": True,
                "messageContent": {"contentType": "Normal", "message": message},
                "sent": True,
            },
        },
        creds,
    )
    return str(result)


async def _log_notification(pool, data: dict) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO notification_log
              (hold_id, driver_name, phone_number, geotab_device_id, message_type, sent_at, status)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
            """,
            data["hold_id"],
            data.get("driver_name"),
            data.get("phone_number"),
            data.get("geotab_device_id"),
            data["message_type"],
            data["sent_at"],
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
    """Send hold TextMessage to all vehicles on site; log each to notification_log."""
    duration_text = (
        f"Work must stop for at least {hold_duration_mins} minutes."
        if hold_duration_mins is not None
        else "Work must stop until conditions improve."
    )
    now_et = datetime.now(timezone.utc).strftime("%-I:%M %p")

    results: list[dict] = []
    for v in vehicles:
        if not v.get("device_id"):
            logger.warning(
                f"[Alert] No device_id for {v.get('driver_name') or v.get('device_name')} — skipping"
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
            msg_id = await _send_geotab_message(v["device_id"], body)
            rec = {
                "driver_name": v.get("driver_name"),
                "phone_number": v.get("phone_number"),
                "geotab_device_id": v["device_id"],
                "message_type": "hold",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "status": "sent",
            }
            await _log_notification(pool, {"hold_id": hold_id, **rec})
            results.append(rec)
            logger.info(
                f"[Alert] Hold sent to {v.get('driver_name') or v['device_name']} "
                f"(device {v['device_id']}) \u2014 msg {msg_id}"
            )
        except Exception as err:
            logger.error(f"[Alert] Failed to send hold to device {v['device_id']}: {err}")

    return results


async def send_all_clear_alerts(
    pool,
    hold_id: str,
    site_name: str,
    rule: str,
    vehicles: list,
) -> list[dict]:
    """Send all-clear TextMessage to all vehicles that were on site; log each."""
    results: list[dict] = []
    for v in vehicles:
        if not v.get("device_id"):
            continue

        body = (
            f"\u2705 ALL CLEAR \u2014 {site_name}\n"
            f"{RULE_LABELS.get(rule, rule)} conditions have passed.\n"
            f"Work may resume. Please confirm with your site supervisor.\n"
            f"Vehicle: {v['device_name']}"
        )

        try:
            msg_id = await _send_geotab_message(v["device_id"], body)
            rec = {
                "driver_name": v.get("driver_name"),
                "phone_number": v.get("phone_number"),
                "geotab_device_id": v["device_id"],
                "message_type": "all_clear",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "status": "sent",
            }
            await _log_notification(pool, {"hold_id": hold_id, **rec})
            results.append(rec)
            logger.info(
                f"[Alert] All-clear sent to {v.get('driver_name') or v['device_name']} "
                f"(device {v['device_id']}) \u2014 msg {msg_id}"
            )
        except Exception as err:
            logger.error(f"[Alert] Failed to send all-clear to device {v['device_id']}: {err}")

    return results
