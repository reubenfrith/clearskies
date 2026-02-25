import { useState } from "react";
import { Button, ButtonType } from "@geotab/zenith";
import { api } from "../lib/api.js";
import type { GeotabZone, SiteWithStatus } from "../lib/types.js";

interface Props {
  zones: Map<string, GeotabZone>;
  sites: SiteWithStatus[];
  onSiteAdded: () => void;
}

function zoneCentroid(zone: GeotabZone): { lat: number; lng: number } {
  const pts = zone.points;
  return {
    lat: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    lng: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  };
}

export function ZoneRegistration({ zones, sites, onSiteAdded }: Props) {
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registeredIds = new Set(sites.map((s) => s.geotab_zone_id));
  const unregistered = [...zones.values()].filter((z) => !registeredIds.has(z.id));

  if (unregistered.length === 0) return null;

  async function handleAdd(zone: GeotabZone) {
    setAdding(zone.id);
    setError(null);
    try {
      const { lat, lng } = zoneCentroid(zone);
      await api.createSite({
        name: zone.name,
        address: zone.comment ?? undefined,
        lat,
        lng,
        geotab_zone_id: zone.id,
      });
      onSiteAdded();
    } catch (err) {
      setError(String(err));
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-amber-900">
          {unregistered.length} Geotab zone{unregistered.length !== 1 ? "s" : ""} not yet registered
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Add zones below to start monitoring them for OSHA weather holds.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="space-y-2">
        {unregistered.map((zone) => (
          <div
            key={zone.id}
            className="flex items-center justify-between gap-4 bg-white rounded border border-amber-100 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{zone.name}</p>
              {zone.comment && (
                <p className="text-xs text-gray-500 truncate">{zone.comment}</p>
              )}
              <p className="text-xs text-gray-400 font-mono">id: {zone.id}</p>
            </div>
            <Button
              type={ButtonType.Secondary}
              onClick={() => handleAdd(zone)}
              disabled={adding === zone.id}
            >
              {adding === zone.id ? "Adding…" : "Add site"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
