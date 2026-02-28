import type { GeotabApi } from "../geotab.js";
import type { GeotabZone } from "./types.js";

interface GeotabEntityArray<T> {
  data?: T[];
  results?: T[];
  toVersion?: string;
  moreData?: boolean;
}

function callGeotab<T>(
  api: GeotabApi,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    api.call(
      method,
      params,
      (result: unknown) => resolve(result as T),
      (err: unknown) => reject(err)
    );
  });
}

function unwrapEntities<T>(result: GeotabEntityArray<T> | T[]): T[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.results)) return result.results;
  return [];
}

/**
 * Create a new circular zone in MyGeotab and return its id.
 */
export async function createGeotabZone(
  api: GeotabApi,
  opts: { name: string; address?: string; lat: number; lng: number; radiusMetres: number }
): Promise<string> {
  const now = new Date().toISOString();
  const result = await callGeotab<string>(api, "Add", {
    typeName: "Zone",
    entity: {
      name: opts.name,
      comment: opts.address ?? "",
      activeFrom: now,
      zoneTypes: [{ id: "ZoneTypeCustomerId" }],
      groups: [{ id: "GroupCompanyId" }],
      points: [{ x: opts.lng, y: opts.lat, z: 0, radius: opts.radiusMetres }],
    },
  });
  return result;
}

/**
 * Soft-deactivate a zone in MyGeotab by setting activeTo to a past date.
 */
export async function deactivateGeotabZone(api: GeotabApi, zoneId: string): Promise<void> {
  await callGeotab<unknown>(api, "Set", {
    typeName: "Zone",
    entity: { id: zoneId, activeTo: "1986-01-01T00:00:00.000Z" },
  });
}

/**
 * Fetch every Zone available to the current MyGeotab session.
 * Uses a high `resultsLimit` to minimize round-trips; callers should
 * memoize or cache results if they re-render frequently.
 */
export async function fetchAllZones(
  api: GeotabApi,
  options: { includeInactive?: boolean } = {}
): Promise<GeotabZone[]> {
  const { includeInactive = false } = options;
  const params: Record<string, unknown> = {
    typeName: "Zone",
    resultsLimit: 1000,
  };

  const result = await callGeotab<GeotabZone[] | GeotabEntityArray<GeotabZone>>(
    api,
    "Get",
    params
  );

  const now = new Date();
  return unwrapEntities(result).filter((zone) => {
    if (!zone?.points?.length) return false;
    if (includeInactive) return true;
    const to = zone.activeTo ? new Date(zone.activeTo) : null;
    return !to || to > now;
  });
}
