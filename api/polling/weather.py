"""Port of agent/src/weatherPoller.ts — Open-Meteo weather fetching."""

import httpx

# Open-Meteo free API — no key required
BASE_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes that indicate active thunderstorm (lightning fallback)
THUNDERSTORM_CODES = {95, 96, 99}


def _mps_to_mph(mps: float) -> float:
    return mps * 2.23694


def _cape_to_probability(cape: float) -> int:
    """Convert CAPE (J/kg) to a lightning probability bucket (0–90%)."""
    if cape < 100:
        return round((cape / 100) * 10)
    if cape < 500:
        return round(10 + ((cape - 100) / 400) * 20)
    if cape < 1500:
        return round(30 + ((cape - 500) / 1000) * 30)
    return min(90, round(60 + ((cape - 1500) / 2000) * 30))


async def fetch_weather(site: dict) -> dict:
    """Fetch current weather for a site and return a WeatherSnapshot dict."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            BASE_URL,
            params={
                "latitude": site["lat"],
                "longitude": site["lng"],
                "current": ",".join([
                    "temperature_2m",
                    "apparent_temperature",
                    "wind_speed_10m",
                    "wind_gusts_10m",
                    "weather_code",
                    "precipitation",
                ]),
                "hourly": "lightning_potential",
                "forecast_hours": 1,
                "wind_speed_unit": "ms",
                "timezone": "auto",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    c = data["current"]

    # Open-Meteo provides lightning_potential as J/kg (CAPE proxy).
    cape: float = (data.get("hourly") or {}).get("lightning_potential", [0])[0] or 0
    lightning_pct = _cape_to_probability(cape)
    if lightning_pct < 40 and c["weather_code"] in THUNDERSTORM_CODES:
        lightning_pct = 50  # active thunderstorm confirmed by WMO code

    return {
        "timestamp": c["time"],
        "wind_speed_mph": round(_mps_to_mph(c["wind_speed_10m"]) * 10) / 10,
        "wind_gust_mph": round(_mps_to_mph(c["wind_gusts_10m"]) * 10) / 10,
        "apparent_temp_c": round(c["apparent_temperature"] * 10) / 10,
        "lightning_probability_pct": lightning_pct,
        "weather_code": c["weather_code"],
        "raw": data,
    }
