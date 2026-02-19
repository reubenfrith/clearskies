import type { WeatherSnapshot, OshaThresholdBreach, OshaRule } from "./types.js";

// ─── OSHA thresholds ──────────────────────────────────────────────────────────
// Production values based on OSHA regulations.
// DEMO_MODE lowers all thresholds so a real weather reading triggers a hold.

interface Thresholds {
  lightningPct: number;       // % probability → triggers 30-min hold (OSHA 30/30 rule)
  highWindGeneralMph: number; // mph → hold until clears (cranes, scaffolding, elevated)
  highWindMaterialMph: number;// mph → hold until clears (aerial lifts, material handling)
  extremeHeatC: number;       // °C apparent temp → ongoing advisory
}

const PROD: Thresholds = {
  lightningPct: 40,
  highWindGeneralMph: 40,
  highWindMaterialMph: 30,
  extremeHeatC: 38,
};

const DEMO: Thresholds = {
  lightningPct: 10,
  highWindGeneralMph: 5,
  highWindMaterialMph: 3,
  extremeHeatC: 25,
};

function getThresholds(): Thresholds {
  return process.env.DEMO_MODE === "true" ? DEMO : PROD;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

/**
 * Evaluates a weather snapshot against OSHA thresholds.
 * Returns the highest-priority breach, or null if all clear.
 * Priority: LIGHTNING > HIGH_WIND_GENERAL > HIGH_WIND_MATERIAL > EXTREME_HEAT
 */
export function evaluateThresholds(weather: WeatherSnapshot): OshaThresholdBreach | null {
  const t = getThresholds();
  const breaches: OshaThresholdBreach[] = [];

  if (weather.lightning_probability_pct >= t.lightningPct) {
    breaches.push({
      rule: "LIGHTNING_30_30",
      value: weather.lightning_probability_pct,
      threshold: t.lightningPct,
      hold_duration_mins: 30,
    });
  }

  // Use gust speed for wind checks — gusts are what cause structural risk
  if (weather.wind_gust_mph >= t.highWindGeneralMph) {
    breaches.push({
      rule: "HIGH_WIND_GENERAL",
      value: weather.wind_gust_mph,
      threshold: t.highWindGeneralMph,
      hold_duration_mins: null, // hold until wind drops
    });
  } else if (weather.wind_gust_mph >= t.highWindMaterialMph) {
    breaches.push({
      rule: "HIGH_WIND_MATERIAL_HANDLING",
      value: weather.wind_gust_mph,
      threshold: t.highWindMaterialMph,
      hold_duration_mins: null,
    });
  }

  if (weather.apparent_temp_c >= t.extremeHeatC) {
    breaches.push({
      rule: "EXTREME_HEAT",
      value: weather.apparent_temp_c,
      threshold: t.extremeHeatC,
      hold_duration_mins: null,
    });
  }

  if (breaches.length === 0) return null;

  // Return highest-priority breach
  const priority: OshaRule[] = [
    "LIGHTNING_30_30",
    "HIGH_WIND_GENERAL",
    "HIGH_WIND_MATERIAL_HANDLING",
    "EXTREME_HEAT",
  ];
  return breaches.sort((a, b) => priority.indexOf(a.rule) - priority.indexOf(b.rule))[0];
}

/**
 * Checks whether an active hold should be cleared based on current weather.
 * For timed holds (lightning 30-min), expiry is checked by the caller via triggered_at.
 * For condition-based holds, we check if weather has dropped below threshold.
 */
export function shouldClearHold(
  rule: OshaRule,
  weather: WeatherSnapshot,
  triggeredAt: Date,
  holdDurationMins: number | null
): boolean {
  // Timed hold: clear after duration elapses regardless of weather
  if (holdDurationMins !== null) {
    const elapsedMs = Date.now() - triggeredAt.getTime();
    return elapsedMs >= holdDurationMins * 60 * 1000;
  }

  // Condition-based hold: clear only when weather drops below threshold
  const t = getThresholds();
  switch (rule) {
    case "HIGH_WIND_GENERAL":
      return weather.wind_gust_mph < t.highWindGeneralMph;
    case "HIGH_WIND_MATERIAL_HANDLING":
      return weather.wind_gust_mph < t.highWindMaterialMph;
    case "EXTREME_HEAT":
      return weather.apparent_temp_c < t.extremeHeatC;
    default:
      return false;
  }
}

export function ruleLabel(rule: OshaRule): string {
  const labels: Record<OshaRule, string> = {
    LIGHTNING_30_30: "Lightning / Thunderstorm (OSHA 30/30 Rule)",
    HIGH_WIND_GENERAL: "High Wind — General (≥40 mph, OSHA 1926.968)",
    HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material Handling (≥30 mph)",
    EXTREME_HEAT: "Extreme Heat (Apparent temp ≥38°C / 100°F)",
  };
  return labels[rule];
}
