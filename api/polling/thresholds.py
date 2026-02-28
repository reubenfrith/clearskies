"""Port of agent/src/thresholdEngine.ts — OSHA threshold evaluation."""

import os
from datetime import datetime, timezone

# ─── OSHA thresholds ──────────────────────────────────────────────────────────

PROD_THRESHOLDS = {
    "lightning_pct": 40,
    "high_wind_general_mph": 40,
    "high_wind_material_mph": 30,
    "extreme_heat_c": 38,
}

DEMO_THRESHOLDS = {
    "lightning_pct": 5,
    "high_wind_general_mph": 3,
    "high_wind_material_mph": 2,
    "extreme_heat_c": 10,
}

RULE_PRIORITY = [
    "LIGHTNING_30_30",
    "HIGH_WIND_GENERAL",
    "HIGH_WIND_MATERIAL_HANDLING",
    "EXTREME_HEAT",
]

RULE_LABELS = {
    "LIGHTNING_30_30": "Lightning / Thunderstorm (OSHA 30/30 Rule)",
    "HIGH_WIND_GENERAL": "High Wind — General (≥40 mph, OSHA 1926.968)",
    "HIGH_WIND_MATERIAL_HANDLING": "High Wind — Material Handling (≥30 mph)",
    "EXTREME_HEAT": "Extreme Heat (Apparent temp ≥38°C / 100°F)",
}


def _get_thresholds() -> dict:
    return DEMO_THRESHOLDS if os.environ.get("DEMO_MODE") == "true" else PROD_THRESHOLDS


def evaluate_thresholds(weather: dict) -> dict | None:
    """
    Evaluate a weather snapshot against OSHA thresholds.
    Returns the highest-priority breach dict, or None if all clear.
    """
    t = _get_thresholds()
    breaches: list[dict] = []

    if weather["lightning_probability_pct"] >= t["lightning_pct"]:
        breaches.append({
            "rule": "LIGHTNING_30_30",
            "value": weather["lightning_probability_pct"],
            "threshold": t["lightning_pct"],
            "hold_duration_mins": 30,
        })

    # Use gust speed — gusts cause structural risk
    if weather["wind_gust_mph"] >= t["high_wind_general_mph"]:
        breaches.append({
            "rule": "HIGH_WIND_GENERAL",
            "value": weather["wind_gust_mph"],
            "threshold": t["high_wind_general_mph"],
            "hold_duration_mins": None,
        })
    elif weather["wind_gust_mph"] >= t["high_wind_material_mph"]:
        breaches.append({
            "rule": "HIGH_WIND_MATERIAL_HANDLING",
            "value": weather["wind_gust_mph"],
            "threshold": t["high_wind_material_mph"],
            "hold_duration_mins": None,
        })

    if weather["apparent_temp_c"] >= t["extreme_heat_c"]:
        breaches.append({
            "rule": "EXTREME_HEAT",
            "value": weather["apparent_temp_c"],
            "threshold": t["extreme_heat_c"],
            "hold_duration_mins": None,
        })

    if not breaches:
        return None

    # Return highest-priority breach
    breaches.sort(key=lambda b: RULE_PRIORITY.index(b["rule"]))
    return breaches[0]


def should_clear_hold(
    rule: str,
    weather: dict,
    triggered_at: datetime,
    hold_duration_mins: int | None,
) -> bool:
    """Check whether an active hold should be cleared based on current weather."""
    # Timed hold: clear after duration elapses
    if hold_duration_mins is not None:
        # Ensure triggered_at is timezone-aware
        if triggered_at.tzinfo is None:
            triggered_at = triggered_at.replace(tzinfo=timezone.utc)
        elapsed_secs = (datetime.now(timezone.utc) - triggered_at).total_seconds()
        return elapsed_secs >= hold_duration_mins * 60

    # Condition-based hold: clear when weather drops below threshold
    t = _get_thresholds()
    if rule == "HIGH_WIND_GENERAL":
        return weather["wind_gust_mph"] < t["high_wind_general_mph"]
    if rule == "HIGH_WIND_MATERIAL_HANDLING":
        return weather["wind_gust_mph"] < t["high_wind_material_mph"]
    if rule == "EXTREME_HEAT":
        return weather["apparent_temp_c"] < t["extreme_heat_c"]
    return False
