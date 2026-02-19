// ─── Domain types ────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geotab_zone_id: string;
  active: boolean;
}

export interface WeatherSnapshot {
  timestamp: string;
  wind_speed_mph: number;
  wind_gust_mph: number;
  apparent_temp_c: number;
  lightning_probability_pct: number;
  weather_code: number; // WMO code
  raw: Record<string, unknown>;
}

export interface OshaThresholdBreach {
  rule: OshaRule;
  value: number;
  threshold: number;
  hold_duration_mins: number | null; // null = hold until condition clears
}

export type OshaRule =
  | "LIGHTNING_30_30"
  | "HIGH_WIND_GENERAL"
  | "HIGH_WIND_MATERIAL_HANDLING"
  | "EXTREME_HEAT";

export interface VehicleOnSite {
  device_id: string;
  device_name: string;
  driver_name: string | null;
  driver_id: string | null;
  phone_number: string | null;
  lat: number;
  lng: number;
  speed: number;
  date_time: string;
}

export interface HoldRecord {
  id: string;
  site_id: string;
  triggered_at: string;
  trigger_rule: OshaRule;
  weather_snapshot: WeatherSnapshot;
  vehicles_on_site: VehicleOnSite[];
  hold_duration_mins: number | null;
  all_clear_at: string | null;
  issued_by: string;
  notifications_sent: NotificationRecord[] | null;
}

export interface NotificationRecord {
  driver_name: string | null;
  phone_number: string;
  message_type: "hold" | "all_clear";
  sent_at: string;
  twilio_sid: string;
  status: string;
}

export interface GeotabSession {
  server: string;
  sessionId: string;
  userName: string;
  database: string;
}
