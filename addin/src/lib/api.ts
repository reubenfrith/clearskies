import type { Site, HoldRecord, NotificationRecord } from "./types.js";
import type { GeotabSession } from "../geotab.js";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

let _session: GeotabSession | null = null;

export function setGeotabSession(session: GeotabSession) {
  _session = session;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const sessionHeaders = _session
    ? {
        "X-Geotab-User": _session.userName,
        "X-Geotab-Session": _session.sessionId,
        "X-Geotab-Database": _session.database,
      }
    : {};

  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...sessionHeaders } as HeadersInit,
    ...options,
  });

  if (res.status === 401) {
    alert("Your session has expired. Please reload the page.");
    throw new Error("Session expired");
  }

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export type HoldRecordWithSite = HoldRecord & { site_name: string };

export interface PagedResponse<T> {
  items: T[];
  total: number;
}

export const api = {
  getSites: () =>
    apiFetch<Site[]>("/api/sites"),

  getSite: (siteId: string) =>
    apiFetch<Site>(`/api/sites/${siteId}`),

  getActiveHolds: (siteId?: string) =>
    apiFetch<HoldRecordWithSite[]>(
      siteId ? `/api/holds/active?site_id=${siteId}` : "/api/holds/active"
    ),

  getHolds: (page = 0, pageSize = 25) =>
    apiFetch<PagedResponse<HoldRecordWithSite>>(
      `/api/holds?page=${page}&page_size=${pageSize}`
    ),

  createHold: (data: { site_id: string; trigger_rule: string; issued_by: string; hold_duration_mins?: number | null }) =>
    apiFetch<HoldRecord>("/api/holds", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  clearHold: (holdId: string) =>
    apiFetch<HoldRecord>(`/api/holds/${holdId}/clear`, { method: "PATCH" }),

  getLogs: (page = 0, pageSize = 50) =>
    apiFetch<PagedResponse<NotificationRecord & { site_name: string; trigger_rule: string }>>(
      `/api/logs?page=${page}&page_size=${pageSize}`
    ),
};
