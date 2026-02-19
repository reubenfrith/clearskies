import axios from "axios";
import type { Site, WeatherSnapshot } from "./types.js";

// Open-Meteo free API — no key required
// Docs: https://open-meteo.com/en/docs
const BASE_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes that indicate thunderstorm activity (for lightning fallback)
const THUNDERSTORM_CODES = new Set([95, 96, 99]);

function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

export async function fetchWeather(site: Site): Promise<WeatherSnapshot> {
  const { data } = await axios.get(BASE_URL, {
    params: {
      latitude: site.lat,
      longitude: site.lng,
      current: [
        "temperature_2m",
        "apparent_temperature",
        "wind_speed_10m",
        "wind_gusts_10m",
        "weather_code",
        "precipitation",
      ].join(","),
      hourly: "lightning_potential",
      forecast_hours: 1,
      wind_speed_unit: "ms",
      timezone: "auto",
    },
    timeout: 10_000,
  });

  const c = data.current;

  // Open-Meteo provides lightning_potential as J/kg (CAPE proxy).
  // We convert to a probability bucket:
  //   0–100 J/kg  → 0–10%
  //   100–500     → 10–30%
  //   500–1500    → 30–60%
  //   >1500       → 60–90%
  // Fallback: if WMO code is a thunderstorm code, treat as >40%.
  const cape: number = data.hourly?.lightning_potential?.[0] ?? 0;
  let lightningPct = capeToProbability(cape);
  if (lightningPct < 40 && THUNDERSTORM_CODES.has(c.weather_code)) {
    lightningPct = 50; // active thunderstorm confirmed by WMO code
  }

  const snapshot: WeatherSnapshot = {
    timestamp: c.time,
    wind_speed_mph: Math.round(mpsToMph(c.wind_speed_10m) * 10) / 10,
    wind_gust_mph: Math.round(mpsToMph(c.wind_gusts_10m) * 10) / 10,
    apparent_temp_c: Math.round(c.apparent_temperature * 10) / 10,
    lightning_probability_pct: lightningPct,
    weather_code: c.weather_code,
    raw: data,
  };

  return snapshot;
}

function capeToProbability(cape: number): number {
  if (cape < 100) return Math.round((cape / 100) * 10);
  if (cape < 500) return Math.round(10 + ((cape - 100) / 400) * 20);
  if (cape < 1500) return Math.round(30 + ((cape - 500) / 1000) * 30);
  return Math.min(90, Math.round(60 + ((cape - 1500) / 2000) * 30));
}
