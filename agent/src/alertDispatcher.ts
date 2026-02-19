import twilio from "twilio";
import { logNotification } from "./supabaseClient.js";
import { ruleLabel } from "./thresholdEngine.js";
import type { VehicleOnSite, OshaRule, NotificationRecord } from "./types.js";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
    _client = twilio(sid, token);
  }
  return _client;
}

const FROM = () => {
  const n = process.env.TWILIO_FROM_NUMBER;
  if (!n) throw new Error("TWILIO_FROM_NUMBER is required");
  return n;
};

// ─── Hold alert ───────────────────────────────────────────────────────────────

export async function sendHoldAlerts(params: {
  holdId: string;
  siteName: string;
  rule: OshaRule;
  vehicles: VehicleOnSite[];
  holdDurationMins: number | null;
}): Promise<NotificationRecord[]> {
  const { holdId, siteName, rule, vehicles, holdDurationMins } = params;

  const durationText =
    holdDurationMins != null
      ? `Work must stop for at least ${holdDurationMins} minutes.`
      : "Work must stop until conditions improve.";

  const results: NotificationRecord[] = [];

  for (const v of vehicles) {
    if (!v.phone_number) {
      console.warn(`[SMS] No phone number for driver ${v.driver_name ?? v.device_name} — skipping`);
      continue;
    }

    const body =
      `⚠️ WORK HOLD — ${siteName}\n` +
      `Reason: ${ruleLabel(rule)}\n` +
      `${durationText}\n` +
      `Vehicle: ${v.device_name}\n` +
      `Issued by ClearSkies at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`;

    try {
      const msg = await getClient().messages.create({
        body,
        from: FROM(),
        to: v.phone_number,
      });

      const rec: NotificationRecord = {
        driver_name: v.driver_name,
        phone_number: v.phone_number,
        message_type: "hold",
        sent_at: new Date().toISOString(),
        twilio_sid: msg.sid,
        status: msg.status,
      };

      await logNotification({ hold_id: holdId, ...rec });
      results.push(rec);
      console.log(`[SMS] Hold sent to ${v.driver_name ?? v.device_name} (${v.phone_number}) — ${msg.sid}`);
    } catch (err) {
      console.error(`[SMS] Failed to send hold to ${v.phone_number}:`, err);
    }
  }

  return results;
}

// ─── All-clear alert ──────────────────────────────────────────────────────────

export async function sendAllClearAlerts(params: {
  holdId: string;
  siteName: string;
  rule: OshaRule;
  vehicles: VehicleOnSite[];
}): Promise<NotificationRecord[]> {
  const { holdId, siteName, rule, vehicles } = params;
  const results: NotificationRecord[] = [];

  for (const v of vehicles) {
    if (!v.phone_number) continue;

    const body =
      `✅ ALL CLEAR — ${siteName}\n` +
      `${ruleLabel(rule)} conditions have passed.\n` +
      `Work may resume. Please confirm with your site supervisor.\n` +
      `Vehicle: ${v.device_name}`;

    try {
      const msg = await getClient().messages.create({
        body,
        from: FROM(),
        to: v.phone_number,
      });

      const rec: NotificationRecord = {
        driver_name: v.driver_name,
        phone_number: v.phone_number,
        message_type: "all_clear",
        sent_at: new Date().toISOString(),
        twilio_sid: msg.sid,
        status: msg.status,
      };

      await logNotification({ hold_id: holdId, ...rec });
      results.push(rec);
      console.log(`[SMS] All-clear sent to ${v.driver_name ?? v.device_name} (${v.phone_number}) — ${msg.sid}`);
    } catch (err) {
      console.error(`[SMS] Failed to send all-clear to ${v.phone_number}:`, err);
    }
  }

  return results;
}
