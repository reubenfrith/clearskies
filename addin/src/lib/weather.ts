const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export interface SiteWeather {
  apparent_temp_c: number;
  precipitation_mm: number;
}

export async function fetchSiteWeather(lat: number, lng: number): Promise<SiteWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "apparent_temperature,precipitation",
    timezone: "auto",
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  const c = data.current;
  return {
    apparent_temp_c: Math.round(c.apparent_temperature * 10) / 10,
    precipitation_mm: Math.round(c.precipitation * 10) / 10,
  };
}
