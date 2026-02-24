import { Link } from "react-router-dom";
import type { SiteWithStatus } from "../lib/types.js";
import { WeatherBadge } from "./WeatherBadge.js";
import { CountdownTimer } from "./CountdownTimer.js";

interface Props {
  site: SiteWithStatus;
}

const BORDER_COLOR = {
  green: "border-green-400",
  amber: "border-amber-400",
  red:   "border-red-500",
};

export function SiteCard({ site }: Props) {
  const { activeHold, weather } = site;
  const border = BORDER_COLOR[site.status];

  return (
    <div className={`bg-white rounded-lg border-l-4 ${border} shadow-sm p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{site.name}</h3>
          {site.address && <p className="text-xs text-gray-500 mt-0.5">{site.address}</p>}
        </div>
        <WeatherBadge
          status={site.status}
          rule={activeHold?.trigger_rule}
        />
      </div>

      {/* Weather summary */}
      {weather && (
        <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 rounded p-2">
          <Stat label="Wind Gust" value={`${weather.wind_gust_mph} mph`} />
          <Stat label="Lightning" value={`${weather.lightning_probability_pct}%`} />
          <Stat label="Heat" value={`${weather.apparent_temp_c}°C`} />
        </div>
      )}

      {/* Active hold info */}
      {activeHold && (
        <div className="space-y-1">
          {activeHold.hold_duration_mins != null ? (
            <CountdownTimer
              triggeredAt={activeHold.triggered_at}
              holdDurationMins={activeHold.hold_duration_mins}
            />
          ) : (
            <p className="text-xs text-red-600 font-medium">
              Hold active until conditions clear
            </p>
          )}
          <p className="text-xs text-gray-500">
            {activeHold.vehicles_on_site.length} vehicle(s) affected •{" "}
            {new Date(activeHold.triggered_at).toLocaleTimeString()}
          </p>
        </div>
      )}

      {/* Link to hold management */}
      <Link
        to={`/holds/${site.id}`}
        className="zen-link mt-auto"
      >
        {activeHold ? "Manage hold →" : "View site →"}
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
    </div>
  );
}
