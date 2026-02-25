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
