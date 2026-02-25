import { useEffect, useState, useCallback } from "react";
import { Button, ButtonType } from "@geotab/zenith";
import { api, API_URL } from "../lib/api.js";
import type { HoldRecord, SiteWithStatus, GeotabZone } from "../lib/types.js";
import { SiteCard } from "../components/SiteCard.js";
import { useGeotabApi } from "../lib/geotabContext.js";
import { fetchAllZones } from "../lib/geotabZones.js";

const REFRESH_INTERVAL_MS = 30_000;

function deriveSiteStatus(hold: HoldRecord | null): SiteWithStatus["status"] {
  if (!hold) return "green";
  return "red";
}

interface DebugInfo {
  sitesReturned: number;
  holdsReturned: number;
  zonesReturned: number | null;
  loadedAt: Date;
}

export function Dashboard() {
  const { session, apiRef } = useGeotabApi();
  const [sites, setSites] = useState<SiteWithStatus[]>([]);
  const [zones, setZones] = useState<Map<string, GeotabZone>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const load = useCallback(async () => {
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
          status: deriveSiteStatus(hold),
          activeHold: hold,
          weather: hold?.weather_snapshot ?? null,
        };
      });

      setSites(withStatus);
      setLastRefresh(new Date());
      setError(null);

      let zonesReturned: number | null = null;
      const geotabApi = apiRef.current;
      if (geotabApi) {
        const allZones = await fetchAllZones(geotabApi).catch(() => []);
        setZones(new Map(allZones.map((z) => [z.id, z])));
        zonesReturned = allZones.length;
      }

      setDebugInfo({
        sitesReturned: sitesData.length,
        holdsReturned: holdsData.length,
        zonesReturned,
        loadedAt: new Date(),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [apiRef]);

  useEffect(() => {
    if (!session) return;
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, session]);

  const redCount = sites.filter((s) => s.status === "red").length;
  const greenCount = sites.filter((s) => s.status === "green").length;

  // Show debug panel automatically when something looks wrong
  const showDebugPanel = showDebug || !session || error !== null || (!loading && sites.length === 0);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ClearSkies Dashboard</h1>
          <p className="text-sm text-gray-500">
            {sites.length} site(s) monitored •{" "}
            <span className="text-red-600 font-medium">{redCount} hold(s) active</span>
            {" / "}
            <span className="text-green-600 font-medium">{greenCount} clear</span>
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
          <Button type={ButtonType.Tertiary} onClick={load}>
            Refresh
          </Button>
          <p className="text-xs text-gray-400">
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {showDebug ? "Hide debug" : "Debug"}
          </button>
        </div>
      </div>

      {/* Debug panel */}
      {showDebugPanel && (
        <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs font-mono space-y-1">
          <p className="text-gray-400 font-sans font-semibold text-xs uppercase tracking-wide mb-2">Debug info</p>
          <Row label="API URL" value={API_URL} />
          <Row
            label="Geotab session"
            value={session ? `✓ ${session.userName} @ ${session.database}` : "✗ null — load() will not run until session resolves"}
            bad={!session}
          />
          <Row
            label="Geotab apiRef"
            value={apiRef.current ? "✓ available (live positions + zones enabled)" : "✗ null (running outside MyGeotab)"}
            bad={!apiRef.current}
          />
          <Row label="Loading" value={String(loading)} />
          {error && <Row label="Error" value={error} bad />}
          {debugInfo ? (
            <>
              <Row label="Last load" value={debugInfo.loadedAt.toLocaleTimeString()} />
              <Row label="Sites returned" value={String(debugInfo.sitesReturned)} bad={debugInfo.sitesReturned === 0} />
              <Row label="Active holds returned" value={String(debugInfo.holdsReturned)} />
              <Row
                label="Zones returned"
                value={debugInfo.zonesReturned === null ? "n/a (no Geotab API)" : String(debugInfo.zonesReturned)}
              />
            </>
          ) : (
            <Row label="Load result" value="not yet run" bad />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-sm text-gray-500 animate-pulse">
          {session ? "Loading sites…" : "Waiting for Geotab session…"}
        </div>
      )}

      {/* Site cards */}
      {!loading && sites.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No active sites found. Add sites to the <code>sites</code> table in the database.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} zone={zones.get(site.geotab_zone_id ?? "")} />
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <p>
      <span className="text-gray-400">{label}: </span>
      <span className={bad ? "text-red-400" : "text-green-300"}>{value}</span>
    </p>
  );
}
