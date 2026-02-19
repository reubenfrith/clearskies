import axios from "axios";
import type { GeotabSession, VehicleOnSite } from "./types.js";

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _session: GeotabSession | null = null;

async function geotabCall<T>(
  server: string,
  method: string,
  params: Record<string, unknown>,
  credentials?: { database: string; userName: string; sessionId: string }
): Promise<T> {
  const url = `https://${server}/apiv1`;
  const body = {
    method,
    params: credentials ? { ...params, credentials } : params,
    id: 1,
  };
  const { data } = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 15_000,
  });
  if (data.error) throw new Error(`Geotab API error [${method}]: ${JSON.stringify(data.error)}`);
  return data.result as T;
}

export async function authenticate(): Promise<GeotabSession> {
  const server = process.env.GEOTAB_SERVER ?? "my.geotab.com";
  const database = process.env.GEOTAB_DATABASE ?? "";
  const userName = process.env.GEOTAB_USERNAME ?? "";
  const password = process.env.GEOTAB_PASSWORD ?? "";

  if (!database || !userName || !password) {
    throw new Error("GEOTAB_DATABASE, GEOTAB_USERNAME, and GEOTAB_PASSWORD are required");
  }

  const result = await geotabCall<{
    credentials: { database: string; userName: string; sessionId: string };
    path: string;
  }>(server, "Authenticate", { database, userName, password });

  // Geotab may redirect to a different server
  const resolvedServer = result.path && result.path !== "ThisServer" ? result.path : server;

  _session = {
    server: resolvedServer,
    sessionId: result.credentials.sessionId,
    userName: result.credentials.userName,
    database: result.credentials.database,
  };

  console.log(`[Geotab] Authenticated as ${userName} on ${resolvedServer}/${database}`);
  return _session;
}

async function getSession(): Promise<GeotabSession> {
  if (!_session) return authenticate();
  return _session;
}

// ─── Zone lookup ──────────────────────────────────────────────────────────────

/**
 * Returns all DeviceStatusInfo records for devices currently inside the given zone.
 * DeviceStatusInfo is Geotab's real-time GPS status (refreshes ~30s).
 */
export async function getVehiclesInZone(zoneId: string): Promise<VehicleOnSite[]> {
  const session = await getSession();
  const creds = {
    database: session.database,
    userName: session.userName,
    sessionId: session.sessionId,
  };

  // Fetch all current device statuses in the zone
  // The search filter `zoneId` on DeviceStatusInfo is supported in Geotab API
  type DeviceStatusInfo = {
    device: { id: string; name: string };
    driver: { id: string; name: string } | null;
    latitude: number;
    longitude: number;
    speed: number;
    dateTime: string;
    isDeviceCommunicating: boolean;
  };

  let statuses: DeviceStatusInfo[];
  try {
    statuses = await geotabCall<DeviceStatusInfo[]>(
      session.server,
      "Get",
      {
        typeName: "DeviceStatusInfo",
        search: { zoneId: { id: zoneId } },
      },
      creds
    );
  } catch (err) {
    // Re-authenticate once on session expiry
    if (String(err).includes("InvalidUserException") || String(err).includes("DbUnavailableException")) {
      _session = null;
      const newSession = await authenticate();
      const newCreds = {
        database: newSession.database,
        userName: newSession.userName,
        sessionId: newSession.sessionId,
      };
      statuses = await geotabCall<DeviceStatusInfo[]>(
        newSession.server,
        "Get",
        { typeName: "DeviceStatusInfo", search: { zoneId: { id: zoneId } } },
        newCreds
      );
    } else {
      throw err;
    }
  }

  // Resolve driver phone numbers via UserSettings or a custom attribute.
  // Geotab doesn't store phone numbers natively — we fetch from the User entity
  // matched by driver name. Companies typically store phone in comments or a
  // custom field; we fall back to null and note it in the VehicleOnSite record.
  const driverIds = [...new Set(statuses.map((s) => s.driver?.id).filter(Boolean) as string[])];
  const phoneMap = await resolveDriverPhones(session, driverIds);

  return statuses
    .filter((s) => s.isDeviceCommunicating)
    .map((s) => ({
      device_id: s.device.id,
      device_name: s.device.name,
      driver_name: s.driver?.name ?? null,
      driver_id: s.driver?.id ?? null,
      phone_number: s.driver ? (phoneMap[s.driver.id] ?? null) : null,
      lat: s.latitude,
      lng: s.longitude,
      speed: s.speed,
      date_time: s.dateTime,
    }));
}

// ─── Driver phone resolution ──────────────────────────────────────────────────

/**
 * Attempts to resolve phone numbers from the Geotab User entity.
 * The `phoneNumber` field is available on User objects in most MyGeotab versions.
 */
async function resolveDriverPhones(
  session: GeotabSession,
  driverIds: string[]
): Promise<Record<string, string>> {
  if (driverIds.length === 0) return {};

  const creds = {
    database: session.database,
    userName: session.userName,
    sessionId: session.sessionId,
  };

  type GeotabUser = { id: string; phoneNumber?: string };

  const phoneMap: Record<string, string> = {};

  // Fetch users in batches to avoid large payloads
  for (const id of driverIds) {
    try {
      const users = await geotabCall<GeotabUser[]>(
        session.server,
        "Get",
        { typeName: "User", search: { id } },
        creds
      );
      if (users[0]?.phoneNumber) {
        phoneMap[id] = normalizePhone(users[0].phoneNumber);
      }
    } catch {
      // Non-fatal: we'll send to vehicles we can reach
    }
  }

  return phoneMap;
}

function normalizePhone(raw: string): string {
  // Strip all non-digits and ensure E.164 format for Twilio
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
