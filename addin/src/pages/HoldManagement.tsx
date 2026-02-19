import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import type { Site, HoldRecord } from "../lib/types.js";
import { WeatherBadge } from "../components/WeatherBadge.js";
import { CountdownTimer } from "../components/CountdownTimer.js";
import { VehicleList } from "../components/VehicleList.js";

const RULE_LABELS: Record<string, string> = {
  LIGHTNING_30_30: "Lightning / Thunderstorm (OSHA 30/30 Rule)",
  HIGH_WIND_GENERAL: "High Wind — General (≥40 mph)",
  HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material Handling (≥30 mph)",
  EXTREME_HEAT: "Extreme Heat (Apparent temp ≥38°C / 100°F)",
};

export function HoldManagement() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();

  const [site, setSite] = useState<Site | null>(null);
  const [hold, setHold] = useState<HoldRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    try {
      const [{ data: siteData, error: siteErr }, { data: holdData, error: holdErr }] =
        await Promise.all([
          supabase.from("sites").select("*").eq("id", siteId).single(),
          supabase
            .from("holds_log")
            .select("*")
            .eq("site_id", siteId)
            .is("all_clear_at", null)
            .order("triggered_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      if (siteErr) throw new Error(siteErr.message);
      if (holdErr) throw new Error(holdErr.message);

      setSite(siteData as Site);
      setHold(holdData as HoldRecord | null);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleManualAllClear() {
    if (!hold) return;
    const confirmed = window.confirm(
      `Issue manual all-clear for ${site?.name}?\n\nThis will close the active hold. Drivers will not receive an automatic SMS — notify them directly.`
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      const { error: updateErr } = await supabase
        .from("holds_log")
        .update({ all_clear_at: new Date().toISOString(), issued_by: "manual-dashboard" })
        .eq("id", hold.id);
      if (updateErr) throw new Error(updateErr.message);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <div className="p-4 text-sm text-gray-500 animate-pulse">Loading…</div>;

  if (!site) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Site not found.</p>
        <button onClick={() => navigate("/")} className="mt-2 text-xs text-geotab-blue hover:underline">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      {/* Back nav */}
      <button onClick={() => navigate("/")} className="text-xs text-geotab-blue hover:underline">
        ← Dashboard
      </button>

      {/* Site header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{site.name}</h1>
          {site.address && <p className="text-sm text-gray-500">{site.address}</p>}
        </div>
        <WeatherBadge
          status={hold ? "red" : "green"}
          rule={hold?.trigger_rule}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {/* No active hold */}
      {!hold && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
          <p className="font-semibold">✅ No active hold</p>
          <p className="text-sm mt-1">This site is currently cleared for work.</p>
        </div>
      )}

      {/* Active hold details */}
      {hold && (
        <div className="space-y-4">
          {/* Hold summary card */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-red-900">Active Hold</h2>
              <span className="text-xs text-red-600">
                Issued by {hold.issued_by} at {new Date(hold.triggered_at).toLocaleTimeString()}
              </span>
            </div>

            <p className="text-sm text-red-800 font-medium">
              {RULE_LABELS[hold.trigger_rule] ?? hold.trigger_rule}
            </p>

            {/* Countdown or condition-based */}
            {hold.hold_duration_mins != null ? (
              <div>
                <p className="text-xs text-red-600 mb-1">Time remaining (30-min rule):</p>
                <CountdownTimer
                  triggeredAt={hold.triggered_at}
                  holdDurationMins={hold.hold_duration_mins}
                />
              </div>
            ) : (
              <p className="text-sm text-red-700">
                Hold will lift automatically when conditions clear.
              </p>
            )}
          </div>

          {/* Weather snapshot */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Weather at time of hold</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Wind Speed" value={`${hold.weather_snapshot.wind_speed_mph} mph`} />
              <Stat label="Wind Gust" value={`${hold.weather_snapshot.wind_gust_mph} mph`} />
              <Stat label="Lightning" value={`${hold.weather_snapshot.lightning_probability_pct}%`} />
              <Stat label="Apparent Temp" value={`${hold.weather_snapshot.apparent_temp_c}°C`} />
            </div>
          </div>

          {/* Vehicles on site */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Vehicles confirmed on site ({hold.vehicles_on_site.length})
            </h3>
            <VehicleList vehicles={hold.vehicles_on_site} />
          </div>

          {/* Manual all-clear */}
          <div className="flex justify-end">
            <button
              onClick={handleManualAllClear}
              disabled={clearing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {clearing ? "Issuing all-clear…" : "Issue Manual All-Clear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
