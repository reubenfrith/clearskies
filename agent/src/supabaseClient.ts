import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Site, HoldRecord, NotificationRecord, VehicleOnSite, WeatherSnapshot, OshaRule } from "./types.js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
    _client = createClient(url, key);
  }
  return _client;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export async function getActiveSites(): Promise<Site[]> {
  const { data, error } = await getClient()
    .from("sites")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(`getActiveSites: ${error.message}`);
  return data as Site[];
}

// ─── Active holds ─────────────────────────────────────────────────────────────

export async function getActiveHold(siteId: string): Promise<HoldRecord | null> {
  const { data, error } = await getClient()
    .from("holds_log")
    .select("*")
    .eq("site_id", siteId)
    .is("all_clear_at", null)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveHold: ${error.message}`);
  return data as HoldRecord | null;
}

// ─── Create hold ──────────────────────────────────────────────────────────────

export async function createHold(params: {
  site_id: string;
  trigger_rule: OshaRule;
  weather_snapshot: WeatherSnapshot;
  vehicles_on_site: VehicleOnSite[];
  hold_duration_mins: number | null;
}): Promise<HoldRecord> {
  const { data, error } = await getClient()
    .from("holds_log")
    .insert({
      site_id: params.site_id,
      triggered_at: new Date().toISOString(),
      trigger_rule: params.trigger_rule,
      weather_snapshot: params.weather_snapshot,
      vehicles_on_site: params.vehicles_on_site,
      hold_duration_mins: params.hold_duration_mins,
      all_clear_at: null,
      issued_by: "auto",
    })
    .select()
    .single();
  if (error) throw new Error(`createHold: ${error.message}`);
  return data as HoldRecord;
}

// ─── Close hold (all-clear) ───────────────────────────────────────────────────

export async function closeHold(holdId: string, notifications: NotificationRecord[]): Promise<void> {
  const { error } = await getClient()
    .from("holds_log")
    .update({
      all_clear_at: new Date().toISOString(),
      notifications_sent: notifications,
    })
    .eq("id", holdId);
  if (error) throw new Error(`closeHold: ${error.message}`);
}

// ─── Notification log ─────────────────────────────────────────────────────────

export async function logNotification(params: {
  hold_id: string;
  driver_name: string | null;
  phone_number: string;
  message_type: "hold" | "all_clear";
  twilio_sid: string;
  status: string;
}): Promise<void> {
  const { error } = await getClient()
    .from("notification_log")
    .insert({
      hold_id: params.hold_id,
      driver_name: params.driver_name,
      phone_number: params.phone_number,
      message_type: params.message_type,
      sent_at: new Date().toISOString(),
      twilio_sid: params.twilio_sid,
      status: params.status,
    });
  if (error) throw new Error(`logNotification: ${error.message}`);
}
