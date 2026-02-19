import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { supabase } from "../lib/supabase.js";
import { useGeotabApi } from "../lib/geotabContext.js";
import type { Site, HoldRecord, SiteWithStatus, VehicleOnSite } from "../lib/types.js";

// ─── Custom div icons ──────────────────────────────────────────────────────────

function makeDotIcon(colour: string, size: number) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${colour};
      border:2px solid rgba(0,0,0,0.35);
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

const SITE_GREEN    = makeDotIcon("#22c55e", 22);
const SITE_RED      = makeDotIcon("#ef4444", 22);
const VEH_ICON      = makeDotIcon("#eab308", 14);  // yellow — normal fleet vehicle
const VEH_HOLD_ICON = makeDotIcon("#f97316", 16);  // orange — vehicle on active hold site

// ─── Live position fetch ───────────────────────────────────────────────────────
// DeviceStatusInfo requires deviceSearch.deviceIds (plural) to return results.
// Step 1: fetch all Device objects to collect IDs.
// Step 2: query DeviceStatusInfo with those IDs.

interface LivePosition {
  deviceId: string;
  deviceName: string;
  lat: number;
  lng: number;
  speed: number;
  isDeviceCommunicating: boolean;
}

function geotabGet<T>(api: { call: Function }, typeName: string, search?: object): Promise<T[]> {
  return new Promise((resolve) => {
    const params: Record<string, unknown> = { typeName };
    if (search) params.search = search;
    api.call("Get", params, (res: T[]) => resolve(res ?? []), () => resolve([]));
  });
}

async function fetchAllDeviceStatuses(
  api: { call: Function }
): Promise<LivePosition[]> {
  // Get all devices so we have their IDs (and names as a fallback)
  const devices = await geotabGet<{ id: string; name: string }>(api, "Device");
  const deviceIds = devices.map((d) => d.id).filter(Boolean);
  if (!deviceIds.length) return [];

  const nameById = new Map(devices.map((d) => [d.id, d.name]));

  // Query DeviceStatusInfo using deviceIds (plural) — this is what MyGeotab's own map sends
  const results = await geotabGet<any>(api, "DeviceStatusInfo", {
    deviceSearch: { deviceIds },
  });

  return results.map((r: any) => {
    const id = r.device?.id ?? "";
    return {
      deviceId: id,
      deviceName: r.device?.name ?? nameById.get(id) ?? "Unknown",
      lat: r.latitude ?? 0,
      lng: r.longitude ?? 0,
      speed: r.speed ?? 0,
      isDeviceCommunicating: r.isDeviceCommunicating ?? false,
    };
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ruleLabelShort(rule: string) {
  const map: Record<string, string> = {
    LIGHTNING_30_30: "Lightning 30/30",
    HIGH_WIND_GENERAL: "High Wind",
    HIGH_WIND_MATERIAL_HANDLING: "High Wind (Material)",
    EXTREME_HEAT: "Extreme Heat",
  };
  return map[rule] ?? rule;
}

function computeBounds(sites: Site[]): [[number, number], [number, number]] | null {
  if (!sites.length) return null;
  const lats = sites.map((s) => s.lat);
  const lngs = sites.map((s) => s.lng);
  return [
    [Math.min(...lats) - 0.05, Math.min(...lngs) - 0.05],
    [Math.max(...lats) + 0.05, Math.max(...lngs) + 0.05],
  ];
}

// ─── Snapshot vehicle marker (fallback when no live API) ──────────────────────

interface SnapshotVehicleMarkerProps {
  vehicle: VehicleOnSite;
  siteName: string;
}

function SnapshotVehicleMarker({ vehicle, siteName }: SnapshotVehicleMarkerProps) {
  const { lat, lng } = vehicle;
  if (!lat || !lng) return null;
  return (
    <Marker position={[lat, lng]} icon={VEH_HOLD_ICON}>
      <Popup>
        <div className="text-sm space-y-0.5 min-w-[140px]">
          <p className="font-semibold">{vehicle.device_name}</p>
          <p className="text-gray-600">{vehicle.driver_name ?? "Unknown driver"}</p>
          <p className="text-gray-500">{siteName}</p>
          <p className="text-gray-500">{vehicle.speed} mph</p>
          <p className="text-xs text-gray-400 mt-1">Position: snapshot</p>
        </div>
      </Popup>
    </Marker>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MapView() {
  const { apiRef, apiReady } = useGeotabApi();
  const [sites, setSites] = useState<SiteWithStatus[]>([]);
  const [livePositions, setLivePositions] = useState<Map<string, LivePosition>>(new Map());
  const [onHoldDeviceIds, setOnHoldDeviceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [liveAvailable, setLiveAvailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: sitesData, error: sitesErr }, { data: holdsData, error: holdsErr }] =
        await Promise.all([
          supabase.from("sites").select("*").eq("active", true).order("name"),
          supabase.from("holds_log").select("*").is("all_clear_at", null),
        ]);

      if (sitesErr) throw new Error(sitesErr.message);
      if (holdsErr) throw new Error(holdsErr.message);

      const holdsBySite = new Map<string, HoldRecord>();
      for (const h of (holdsData ?? []) as HoldRecord[]) {
        holdsBySite.set(h.site_id, h);
      }

      const withStatus: SiteWithStatus[] = (sitesData as Site[]).map((s) => {
        const hold = holdsBySite.get(s.id) ?? null;
        return {
          ...s,
          status: hold ? "red" : "green",
          activeHold: hold,
          weather: hold?.weather_snapshot ?? null,
        };
      });

      setSites(withStatus);
      setLastRefresh(new Date());
      setError(null);

      // Track which device IDs are currently on an active-hold site (for colour-coding)
      const holdDeviceIds = new Set<string>(
        (holdsData as HoldRecord[]).flatMap(
          (h) => (h.vehicles_on_site ?? []).map((v) => v.device_id)
        )
      );
      setOnHoldDeviceIds(holdDeviceIds);

      // Fetch live positions from Geotab API (all fleet vehicles, no filter)
      const api = apiRef.current;
      if (api) {
        setLiveAvailable(true);
        const positions = await fetchAllDeviceStatuses(api);
        const posMap = new Map<string, LivePosition>();
        for (const p of positions) {
          if (p.lat && p.lng) posMap.set(p.deviceId, p);
        }
        setLivePositions(posMap);
      } else {
        setLiveAvailable(false);
        setLivePositions(new Map());
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [apiRef, apiReady]);

  useEffect(() => {
    load();
  }, [load]);

  const bounds = computeBounds(sites);
  // Default centre: Las Vegas area if no sites yet
  const defaultCenter: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [36.1699, -115.1398];

  return (
    <div className="relative" style={{ height: "calc(100vh - 48px)" }}>
      {/* Dev-mode badge */}
      {!liveAvailable && !loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-100 border border-amber-300 text-amber-800 text-xs px-3 py-1 rounded-full shadow">
          Live positions unavailable — open in MyGeotab for real-time tracking
        </div>
      )}

      {/* Refresh button */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1">
        <button
          onClick={load}
          className="bg-white border border-gray-200 shadow text-xs text-geotab-blue hover:bg-gray-50 px-3 py-1.5 rounded"
        >
          Refresh
        </button>
        <span className="text-xs text-gray-500 bg-white/80 px-2 py-0.5 rounded">
          {lastRefresh.toLocaleTimeString()}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="absolute top-3 left-3 z-[1000] bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded shadow max-w-xs">
          {error}
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60">
          <span className="text-sm text-gray-500 animate-pulse">Loading map…</span>
        </div>
      )}

      <MapContainer
        bounds={bounds ?? undefined}
        center={bounds ? undefined : defaultCenter}
        zoom={bounds ? undefined : 11}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Site markers */}
        {sites.map((site) => (
          <Marker
            key={site.id}
            position={[site.lat, site.lng]}
            icon={site.status === "red" ? SITE_RED : SITE_GREEN}
          >
            <Popup>
              <div className="text-sm space-y-1 min-w-[160px]">
                <p className="font-semibold text-base">{site.name}</p>
                {site.address && <p className="text-gray-500 text-xs">{site.address}</p>}
                {site.status === "red" && site.activeHold ? (
                  <>
                    <p className="text-red-600 font-medium">
                      Hold Active — {ruleLabelShort(site.activeHold.trigger_rule)}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Since {new Date(site.activeHold.triggered_at).toLocaleTimeString()}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {site.activeHold.vehicles_on_site?.length ?? 0} vehicle(s) on site
                    </p>
                  </>
                ) : (
                  <p className="text-green-600 font-medium">Clear</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Live vehicle markers — all fleet vehicles when Geotab API is available.
            Orange = on an active-hold site; yellow = rest of fleet. */}
        {livePositions.size > 0 &&
          [...livePositions.values()].map((pos) => {
            const isOnHold = onHoldDeviceIds.has(pos.deviceId);
            return (
              <Marker
                key={pos.deviceId}
                position={[pos.lat, pos.lng]}
                icon={isOnHold ? VEH_HOLD_ICON : VEH_ICON}
              >
                <Popup>
                  <div className="text-sm space-y-0.5 min-w-[140px]">
                    <p className="font-semibold">{pos.deviceName}</p>
                    {isOnHold && (
                      <p className="text-orange-600 font-medium text-xs">On Active Hold Site</p>
                    )}
                    <p className="text-gray-500">{pos.speed} mph</p>
                    {!pos.isDeviceCommunicating && (
                      <p className="text-xs text-gray-400">Not communicating</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Position: live</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Snapshot vehicle markers — fallback when no live API available */}
        {livePositions.size === 0 &&
          sites
            .filter((s) => s.status === "red" && s.activeHold)
            .flatMap((s) =>
              (s.activeHold!.vehicles_on_site ?? []).map((v) => (
                <SnapshotVehicleMarker
                  key={v.device_id}
                  vehicle={v}
                  siteName={s.name}
                />
              ))
            )}
      </MapContainer>
    </div>
  );
}
