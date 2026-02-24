import { useEffect, useState, useCallback } from "react";
import { Button, ButtonType } from "@geotab/zenith";
import { api } from "../lib/api.js";
import type { HoldRecord, SiteWithStatus } from "../lib/types.js";
import { SiteCard } from "../components/SiteCard.js";
import { useGeotabApi } from "../lib/geotabContext.js";

const REFRESH_INTERVAL_MS = 30_000;

function deriveSiteStatus(hold: HoldRecord | null): SiteWithStatus["status"] {
  if (!hold) return "green";
  return "red";
}

export function Dashboard() {
  const { session } = useGeotabApi();
  const [sites, setSites] = useState<SiteWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load, session]);

  const redCount = sites.filter((s) => s.status === "red").length;
  const greenCount = sites.filter((s) => s.status === "green").length;

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
        <div className="text-right">
          <Button type={ButtonType.Tertiary} onClick={load}>
            Refresh
          </Button>
          <p className="text-xs text-gray-400 mt-0.5">
            Updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-sm text-gray-500 animate-pulse">Loading sites…</div>
      )}

      {/* Site cards */}
      {!loading && sites.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No active sites found. Add sites to the <code>sites</code> table in the database.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} />
        ))}
      </div>
    </div>
  );
}
