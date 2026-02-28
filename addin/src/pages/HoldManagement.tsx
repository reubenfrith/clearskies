import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, ButtonType, Card } from "@geotab/zenith";
import { api } from "../lib/api.js";
import type { Site, HoldRecord } from "../lib/types.js";
import { WeatherBadge } from "../components/WeatherBadge.js";
import { CountdownTimer } from "../components/CountdownTimer.js";
import { VehicleList } from "../components/VehicleList.js";
import { useGeotabApi } from "../lib/geotabContext.js";

// ─── Nearby data ──────────────────────────────────────────────────────────────

const NEARBY_RADIUS_FALLBACK_M = 1000;
const RECENT_MINS = 60;
const ZONE_HISTORY_HOURS = 2;

interface NearbyVehicle {
  deviceId: string;
  deviceName: string;
  isAsset: boolean;
  driverName: string | null;
  lat: number;
  lng: number;
  speed: number;
  distanceMetres: number;
  lastSeen: Date;
}

interface ZoneVisit {
  deviceId: string;
  deviceName: string;
  driverName: string | null;
  enteredAt: Date;
  exitedAt: Date | null; // null = still in zone
}

interface NearbyDriver {
  userId: string;
  userName: string;
  distanceMetres: number;
  lastSeen: Date;
}

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geotabGet<T>(api: { call: Function }, typeName: string, search?: object): Promise<T[]> {
  return new Promise((resolve) => {
    const params: Record<string, unknown> = { typeName };
    if (search) params.search = search;
    api.call("Get", params, (res: T[]) => resolve(res ?? []), () => resolve([]));
  });
}

function formatDuration(from: Date, to: Date | null): string {
  if (!to) return "ongoing";
  const mins = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function fetchNearbyVehicles(
  geotabApi: { call: Function },
  site: Site
): Promise<NearbyVehicle[]> {
  const radiusM = site.radius_m ?? NEARBY_RADIUS_FALLBACK_M;
  const cutoff = new Date(Date.now() - RECENT_MINS * 60 * 1000);

  const [devices, statuses] = await Promise.all([
    geotabGet<{ id: string; name: string; deviceType: string }>(geotabApi, "Device"),
    geotabGet<any>(geotabApi, "DeviceStatusInfo"),
  ]);
  const nameById = new Map(devices.map((d) => [d.id, d.name]));
  const typeById = new Map(devices.map((d) => [d.id, d.deviceType]));

  const nearby: NearbyVehicle[] = [];
  for (const s of statuses) {
    const lat: number = s.latitude ?? 0;
    const lng: number = s.longitude ?? 0;
    if (!lat && !lng) continue;

    const lastSeen = s.dateTime ? new Date(s.dateTime) : new Date(0);
    if (lastSeen < cutoff) continue;

    const dist = haversineMetres(site.lat, site.lng, lat, lng);
    if (dist > radiusM) continue;

    const id: string = s.device?.id ?? "";
    const deviceType = typeById.get(id) ?? null;
    nearby.push({
      deviceId: id,
      deviceName: s.device?.name ?? nameById.get(id) ?? (id || "Unknown"),
      isAsset: !!deviceType && !deviceType.startsWith("GO") && deviceType !== "CustomVehicleDevice",
      driverName: s.driver?.name ?? null,
      lat,
      lng,
      speed: s.speed ?? 0,
      distanceMetres: Math.round(dist),
      lastSeen,
    });
  }

  return nearby.sort((a, b) => a.distanceMetres - b.distanceMetres);
}

async function fetchZoneHistory(
  geotabApi: { call: Function },
  zoneId: string
): Promise<ZoneVisit[]> {
  const fromDate = new Date(Date.now() - ZONE_HISTORY_HOURS * 60 * 60 * 1000).toISOString();
  const stops = await geotabGet<any>(geotabApi, "ZoneStop", {
    zoneSearch: { id: zoneId },
    fromDate,
  });
  return stops
    .map((s: any) => ({
      deviceId: s.device?.id ?? "",
      deviceName: s.device?.name ?? "Unknown",
      driverName: s.driver?.name ?? null,
      enteredAt: new Date(s.start ?? s.activeFrom ?? 0),
      exitedAt: (s.stop ?? s.activeTo) ? new Date(s.stop ?? s.activeTo) : null,
    }))
    .sort((a: ZoneVisit, b: ZoneVisit) => b.enteredAt.getTime() - a.enteredAt.getTime());
}

async function fetchNearbyDrivers(
  geotabApi: { call: Function },
  site: Site
): Promise<NearbyDriver[]> {
  const radiusM = site.radius_m ?? NEARBY_RADIUS_FALLBACK_M;
  const cutoff = new Date(Date.now() - RECENT_MINS * 60 * 1000);

  const locations = await geotabGet<any>(geotabApi, "UserLocation");
  const nearby: NearbyDriver[] = [];
  for (const loc of locations) {
    const lat: number = loc.latitude ?? 0;
    const lng: number = loc.longitude ?? 0;
    if (!lat && !lng) continue;

    const lastSeen = loc.dateTime ? new Date(loc.dateTime) : new Date(0);
    if (lastSeen < cutoff) continue;

    const dist = haversineMetres(site.lat, site.lng, lat, lng);
    if (dist > radiusM) continue;

    nearby.push({
      userId: loc.user?.id ?? "",
      userName: loc.user?.name ?? "Unknown",
      distanceMetres: Math.round(dist),
      lastSeen,
    });
  }

  return nearby.sort((a, b) => a.distanceMetres - b.distanceMetres);
}

const RULE_LABELS: Record<string, string> = {
  LIGHTNING_30_30: "Lightning / Thunderstorm (OSHA 30/30 Rule)",
  HIGH_WIND_GENERAL: "High Wind — General (≥40 mph)",
  HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material Handling (≥30 mph)",
  EXTREME_HEAT: "Extreme Heat (Apparent temp ≥38°C / 100°F)",
};

export function HoldManagement() {
  const { session, apiRef } = useGeotabApi();
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();

  const [site, setSite] = useState<Site | null>(null);
  const [hold, setHold] = useState<HoldRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearbyVehicles, setNearbyVehicles] = useState<NearbyVehicle[]>([]);
  const [zoneHistory, setZoneHistory] = useState<ZoneVisit[]>([]);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyRefreshedAt, setNearbyRefreshedAt] = useState<Date | null>(null);

  const loadNearby = useCallback(async (siteData: Site) => {
    if (!apiRef.current) return;
    setNearbyLoading(true);
    try {
      const [vehicles, history, drivers] = await Promise.all([
        fetchNearbyVehicles(apiRef.current, siteData),
        siteData.geotab_zone_id
          ? fetchZoneHistory(apiRef.current, siteData.geotab_zone_id)
          : Promise.resolve([] as ZoneVisit[]),
        fetchNearbyDrivers(apiRef.current, siteData),
      ]);
      setNearbyVehicles(vehicles);
      setZoneHistory(history);
      setNearbyDrivers(drivers);
      setNearbyRefreshedAt(new Date());
    } catch {
      setNearbyVehicles([]);
      setZoneHistory([]);
      setNearbyDrivers([]);
    } finally {
      setNearbyLoading(false);
    }
  }, [apiRef]);

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const [siteData, activeHolds] = await Promise.all([
        api.getSite(siteId),
        api.getActiveHolds(siteId),
      ]);

      setSite(siteData);
      setHold(activeHolds[0] ?? null);
      setError(null);
      loadNearby(siteData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [siteId, loadNearby]);

  useEffect(() => {
    if (!session) return;
    load();
  }, [load, session]);

  async function handleManualAllClear() {
    if (!hold) return;
    const confirmed = window.confirm(
      `Issue manual all-clear for ${site?.name}?\n\nThis will close the active hold. Drivers will not receive an automatic SMS — notify them directly.`
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      await api.clearHold(hold.id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500 animate-pulse">Loading…</div>;

  if (!site) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Site not found.</p>
        <button onClick={() => navigate("/")} className="zen-link mt-2 text-xs">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  const refreshLabel = nearbyRefreshedAt ? ` · ${nearbyRefreshedAt.toLocaleTimeString()}` : "";

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      {/* Back nav */}
      <button onClick={() => navigate("/")} className="zen-link text-xs">
        ← Dashboard
      </button>

      {/* Site header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{site.name}</h1>
          {site.address && <p className="text-sm text-gray-500">{site.address}</p>}
        </div>
        <WeatherBadge
          status={hold ? "red" : "green"}
          rule={hold?.trigger_rule}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* No active hold */}
      {!hold && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
          <p className="font-semibold">✅ No active hold</p>
          <p className="text-sm mt-1">This site is currently cleared for work.</p>
        </div>
      )}

      {/* ── Nearby section (only when Geotab API available) ── */}
      {apiRef.current && (
        <>
          {/* Vehicles & assets nearby */}
          <Card
            title={`Devices nearby — within ${site.radius_m ?? NEARBY_RADIUS_FALLBACK_M}m, last ${RECENT_MINS} min${refreshLabel}`}
            fullWidth
          >
            <Card.Content>
              {nearbyLoading ? (
                <p className="text-sm text-gray-500 animate-pulse">Fetching live positions…</p>
              ) : nearbyVehicles.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No devices detected nearby.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-1 font-medium">Device</th>
                      <th className="pb-1 font-medium">Driver</th>
                      <th className="pb-1 font-medium text-right">Distance</th>
                      <th className="pb-1 font-medium text-right">Speed</th>
                      <th className="pb-1 font-medium text-right">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearbyVehicles.map((v) => (
                      <tr key={v.deviceId} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 font-medium text-gray-900">
                          {v.deviceName}
                          {v.isAsset && (
                            <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                              Asset
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-gray-600">{v.driverName ?? "—"}</td>
                        <td className="py-1.5 text-right text-gray-700">{v.distanceMetres} m</td>
                        <td className="py-1.5 text-right text-gray-700">{v.speed} mph</td>
                        <td className="py-1.5 text-right text-gray-400 text-xs">
                          {v.lastSeen.toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => site && loadNearby(site)}
                  disabled={nearbyLoading}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {nearbyLoading ? "Refreshing…" : "↻ Refresh"}
                </button>
              </div>
            </Card.Content>
          </Card>

          {/* Zone history */}
          <Card
            title={`Zone history — last ${ZONE_HISTORY_HOURS}h${refreshLabel}`}
            fullWidth
          >
            <Card.Content>
              {nearbyLoading ? (
                <p className="text-sm text-gray-500 animate-pulse">Loading zone history…</p>
              ) : zoneHistory.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No zone visits recorded in the last {ZONE_HISTORY_HOURS} hours.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-1 font-medium">Device</th>
                      <th className="pb-1 font-medium">Driver</th>
                      <th className="pb-1 font-medium text-right">Entered</th>
                      <th className="pb-1 font-medium text-right">Exited</th>
                      <th className="pb-1 font-medium text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneHistory.map((v, i) => (
                      <tr key={`${v.deviceId}-${i}`} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 font-medium text-gray-900">{v.deviceName}</td>
                        <td className="py-1.5 text-gray-600">{v.driverName ?? "—"}</td>
                        <td className="py-1.5 text-right text-gray-700 text-xs">{v.enteredAt.toLocaleTimeString()}</td>
                        <td className="py-1.5 text-right text-xs">
                          {v.exitedAt ? (
                            <span className="text-gray-700">{v.exitedAt.toLocaleTimeString()}</span>
                          ) : (
                            <span className="text-green-600 font-medium">On site</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-gray-500 text-xs">
                          {formatDuration(v.enteredAt, v.exitedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card.Content>
          </Card>

          {/* Nearby drivers (Geotab Drive app) — only shown if data available */}
          {(nearbyDrivers.length > 0 || nearbyLoading) && (
            <Card
              title={`People nearby — Geotab Drive app${refreshLabel}`}
              fullWidth
            >
              <Card.Content>
                {nearbyLoading ? (
                  <p className="text-sm text-gray-500 animate-pulse">Fetching driver locations…</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-1 font-medium">Driver</th>
                        <th className="pb-1 font-medium text-right">Distance</th>
                        <th className="pb-1 font-medium text-right">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nearbyDrivers.map((d) => (
                        <tr key={d.userId} className="border-b border-gray-50 last:border-0">
                          <td className="py-1.5 font-medium text-gray-900">{d.userName}</td>
                          <td className="py-1.5 text-right text-gray-700">{d.distanceMetres} m</td>
                          <td className="py-1.5 text-right text-gray-400 text-xs">
                            {d.lastSeen.toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card.Content>
            </Card>
          )}
        </>
      )}

      {/* Active hold details */}
      {hold && (
        <div className="space-y-4">
          {/* Hold summary card */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-red-900">Active Hold</h2>
              <span className="text-xs text-red-600">
                Issued by {hold.issued_by} at {new Date(hold.triggered_at).toLocaleTimeString()}
              </span>
            </div>

            <p className="text-sm text-red-800 font-medium">
              {RULE_LABELS[hold.trigger_rule] ?? hold.trigger_rule}
            </p>

            {hold.hold_duration_mins != null ? (
              <div>
                <p className="text-xs text-red-600 mb-1">Time remaining (30-min rule):</p>
                <CountdownTimer
                  triggeredAt={hold.triggered_at}
                  holdDurationMins={hold.hold_duration_mins}
                />
              </div>
            ) : (
              <p className="text-sm text-red-700">
                Hold will lift automatically when conditions clear.
              </p>
            )}
          </div>

          {/* Weather snapshot */}
          <Card title="Weather at time of hold" fullWidth>
            <Card.Content>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Wind Speed" value={`${hold.weather_snapshot.wind_speed_mph} mph`} />
                <Stat label="Wind Gust" value={`${hold.weather_snapshot.wind_gust_mph} mph`} />
                <Stat label="Lightning" value={`${hold.weather_snapshot.lightning_probability_pct}%`} />
                <Stat label="Apparent Temp" value={`${hold.weather_snapshot.apparent_temp_c}°C`} />
              </div>
            </Card.Content>
          </Card>

          {/* Vehicles on site */}
          <Card title={`Vehicles confirmed on site (${hold.vehicles_on_site.length})`} fullWidth>
            <Card.Content>
              <VehicleList vehicles={hold.vehicles_on_site} />
            </Card.Content>
          </Card>

          {/* Manual all-clear */}
          <div className="flex justify-end">
            <Button
              type={ButtonType.Primary}
              onClick={handleManualAllClear}
              disabled={clearing}
            >
              {clearing ? "Issuing all-clear…" : "Issue Manual All-Clear"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
