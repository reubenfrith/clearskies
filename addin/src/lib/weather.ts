const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export interface SiteWeather {
  apparent_temp_c: number;
  precipitation_probability_pct: number;
}

export async function fetchSiteWeather(lat: number, lng: number): Promise<SiteWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "apparent_temperature",
    hourly: "precipitation_probability",
    forecast_days: "1",
    timezone: "auto",
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();

  // current.time is "2024-01-01T14:00"; match against hourly.time array for probability
  const currentHour: string = data.current.time;
  const hourIndex: number = (data.hourly.time as string[]).indexOf(currentHour);
  const precipPct: number = hourIndex >= 0 ? data.hourly.precipitation_probability[hourIndex] : 0;

  return {
    apparent_temp_c: Math.round(data.current.apparent_temperature * 10) / 10,
    precipitation_probability_pct: precipPct,
  };
}
