import "dotenv/config";
import { getActiveSites, getActiveHold, createHold, closeHold } from "./supabaseClient.js";
import { fetchWeather } from "./weatherPoller.js";
import { evaluateThresholds, shouldClearHold } from "./thresholdEngine.js";
import { authenticate, getVehiclesInZone } from "./geotabResolver.js";
import { sendHoldAlerts, sendAllClearAlerts } from "./alertDispatcher.js";
import type { Site, VehicleOnSite } from "./types.js";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MINUTES ?? 5) * 60 * 1000;

async function processSite(site: Site) {
  const { id: siteId, name: siteName, geotab_zone_id: zoneId } = site;

  const [weather, activeHold] = await Promise.all([
    fetchWeather(site).catch(() => null),
    getActiveHold(siteId).catch(() => null),
  ]);

  // Can't evaluate without weather — skip this cycle
  if (!weather) {
    console.warn(`[${siteName}] Weather fetch failed — skipping`);
    return;
  }

  const breach = evaluateThresholds(weather);

  if (activeHold) {
    // ── Active hold: check if we should issue all-clear ──────────────────────
    const triggeredAt = new Date(activeHold.triggered_at);
    const clear = shouldClearHold(activeHold.trigger_rule, weather, triggeredAt, activeHold.hold_duration_mins);

    if (clear) {
      console.log(`[${siteName}] Conditions cleared — issuing all-clear for hold ${activeHold.id}`);
      const vehicles = activeHold.vehicles_on_site as VehicleOnSite[];
      const notifications = await sendAllClearAlerts({
        holdId: activeHold.id,
        siteName,
        rule: activeHold.trigger_rule,
        vehicles,
      });
      await closeHold(activeHold.id, notifications);
      console.log(`[${siteName}] All-clear issued to ${notifications.length} driver(s)`);
    } else {
      console.log(`[${siteName}] Hold active since ${activeHold.triggered_at} — no change`);
    }
  } else if (breach) {
    // ── No active hold + threshold breached: open a new hold ─────────────────
    console.log(`[${siteName}] Threshold breached: ${breach.rule} (${breach.value} vs ${breach.threshold})`);

    const vehicles = await getVehiclesInZone(zoneId);
    console.log(`[${siteName}] ${vehicles.length} vehicle(s) on site`);

    const hold = await createHold({
      site_id: siteId,
      trigger_rule: breach.rule,
      weather_snapshot: weather,
      vehicles_on_site: vehicles,
      hold_duration_mins: breach.hold_duration_mins,
    });

    const notifications = await sendHoldAlerts({
      holdId: hold.id,
      siteName,
      rule: breach.rule,
      vehicles,
      holdDurationMins: breach.hold_duration_mins,
    });

    console.log(`[${siteName}] Hold ${hold.id} created — ${notifications.length} SMS sent`);
  } else {
    console.log(`[${siteName}] All clear — wind ${weather.wind_gust_mph}mph, lightning ${weather.lightning_probability_pct}%, heat ${weather.apparent_temp_c}°C`);
  }
}

async function poll() {
  console.log(`\n[ClearSkies] Poll started at ${new Date().toISOString()}`);

  let sites;
  try {
    sites = await getActiveSites();
  } catch (err) {
    console.error("[ClearSkies] Failed to fetch sites:", err);
    return;
  }

  console.log(`[ClearSkies] Monitoring ${sites.length} active site(s)`);

  // Process all sites concurrently — failures on one site don't block others
  await Promise.allSettled(
    sites.map((site) =>
      processSite(site).catch((err) =>
        console.error(`[${site.name}] Unhandled error:`, err)
      )
    )
  );

  console.log(`[ClearSkies] Poll complete`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log("🌤️  ClearSkies monitoring agent starting...");
  console.log(`   Poll interval: ${POLL_INTERVAL_MS / 60_000} min`);
  console.log(`   Demo mode: ${process.env.DEMO_MODE === "true" ? "ON" : "off"}`);

  // Authenticate with Geotab upfront so the first poll is fast
  try {
    await authenticate();
  } catch (err) {
    console.error("[Geotab] Initial authentication failed:", err);
    console.error("Check GEOTAB_* env vars. Agent will retry on next poll.");
  }

  // Run immediately, then on interval
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
