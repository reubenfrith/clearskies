import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polygon, Tooltip } from "react-leaflet";
import L from "leaflet";
import { Button, ButtonType } from "@geotab/zenith";
import { api } from "../lib/api.js";
import { useGeotabApi } from "../lib/geotabContext.js";
import { fetchAllZones } from "../lib/geotabZones.js";
import type {
  Site,
  HoldRecord,
  SiteStatus,
  SiteWithStatus,
  VehicleOnSite,
  GeotabZone,
} from "../lib/types.js";

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

interface ZoneFeature {
  id: string;
  name: string;
  coordinates: [number, number][];
  status: SiteStatus;
  siteId?: string;
  siteName?: string;
  zoneType?: string | null;
}

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
  const devices = await geotabGet<{ id: string; name: string }>(api, "Device");
  const deviceIds = devices.map((d) => d.id).filter(Boolean);
  if (!deviceIds.length) return [];

  const nameById = new Map(devices.map((d) => [d.id, d.name]));

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

function buildZoneFeatures(zones: GeotabZone[], sites: SiteWithStatus[]): ZoneFeature[] {
  const siteByZoneId = new Map<string, SiteWithStatus>(
    sites
      .filter((site) => Boolean(site.geotab_zone_id))
      .map((site) => [site.geotab_zone_id, site])
  );

  return zones
    .filter((zone) => zone.points?.length)
    .map((zone) => {
      const linkedSite = siteByZoneId.get(zone.id);
      const coordinates: [number, number][] = zone.points.map((point) => [point.y, point.x]);
      return {
        id: zone.id,
        name: zone.name || "Untitled zone",
        coordinates,
        status: linkedSite?.status ?? "green",
        siteId: linkedSite?.id,
        siteName: linkedSite?.name,
        zoneType: zone.zoneType?.name ?? null,
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

function SnapshotVehicleMarker({ vehicle, siteName }: { vehicle: VehicleOnSite; siteName: string }) {
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
  const [zones, setZones] = useState<ZoneFeature[]>([]);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesData, holdsData] = await Promise.all([
        api.getSites(),
        api.getActiveHolds(),
      ]);

      const holdsBySite = new Map<string, HoldRecord>();
      for (const h of holdsData) {
        holdsBySite.set(h.site_id, h);
      }

      const withStatus: SiteWithStatus[] = sitesData.map((s) => {
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

      // Track which device IDs are on an active-hold site (for colour-coding)
      const holdDeviceIds = new Set<string>(
        holdsData.flatMap(
          (h) => (h.vehicles_on_site ?? []).map((v) => v.device_id)
        )
      );
      setOnHoldDeviceIds(holdDeviceIds);

      // Fetch live positions from Geotab API (all fleet vehicles)
      const geotabApi = apiRef.current;
      if (geotabApi) {
        setLiveAvailable(true);
        const [positionsResult, zonesResult] = await Promise.allSettled([
          fetchAllDeviceStatuses(geotabApi),
          fetchAllZones(geotabApi),
        ]);

        if (positionsResult.status === "fulfilled") {
          const posMap = new Map<string, LivePosition>();
          for (const p of positionsResult.value) {
            if (p.lat !== 0 || p.lng !== 0) posMap.set(p.deviceId, p);
          }
          setLivePositions(posMap);
        } else {
          console.warn("[MapView] Failed to load live positions", positionsResult.reason);
          setLivePositions(new Map());
        }

        if (zonesResult.status === "fulfilled") {
          setZones(buildZoneFeatures(zonesResult.value, withStatus));
          setZoneError(null);
        } else {
          console.warn("[MapView] Failed to load Geotab zones", zonesResult.reason);
          setZones([]);
          setZoneError("Unable to load Geotab zones");
        }
      } else {
        setLiveAvailable(false);
        setLivePositions(new Map());
        setZones([]);
        setZoneError(null);
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
  const defaultCenter: [number, number] = bounds
    ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
    : [36.1699, -115.1398];

  return (
    <div className="relative" style={{ height: "100%" }}>
      {/* Dev-mode badge */}
      {!liveAvailable && !loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-100 border border-amber-300 text-amber-800 text-xs px-3 py-1 rounded-full shadow">
          Live positions unavailable — open in MyGeotab for real-time tracking
        </div>
      )}

      {/* Refresh button */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1">
        <Button type={ButtonType.Tertiary} onClick={load}>
          Refresh
        </Button>
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

      {zoneError && (
        <div className="absolute top-16 left-3 z-[1000] bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded shadow max-w-xs">
          {zoneError}
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

        {/* Zone polygons */}
        {zones.map((zone) => {
          const isHold = zone.status === "red";
          const stroke = isHold ? "#ef4444" : "#22c55e";
          return (
            <Polygon
              key={zone.id}
              positions={zone.coordinates}
              pathOptions={{
                color: stroke,
                fillColor: stroke,
                fillOpacity: 0.15,
                weight: zone.siteId ? 2 : 1,
              }}
            >
              <Tooltip sticky>
                <div className="text-xs space-y-0.5 min-w-[140px]">
                  <p className="font-semibold">{zone.name}</p>
                  {zone.zoneType && <p className="text-gray-500">{zone.zoneType}</p>}
                  {zone.siteName && (
                    <p className="text-gray-500">Linked site: {zone.siteName}</p>
                  )}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

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

        {/* Live vehicle markers — all fleet vehicles.
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
