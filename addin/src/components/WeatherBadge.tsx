import type { OshaRule, SiteStatus } from "../lib/types.js";
import { Tooltip } from "./Tooltip.js";

interface Props {
  status: SiteStatus;
  rule?: OshaRule | null;
  windGust?: number;
  lightningPct?: number;
  heatC?: number;
}

const STATUS_CONFIG = {
  green: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500", label: "All Clear" },
  amber: { bg: "bg-amber-100", text: "text-amber-800", dot: "bg-amber-500", label: "Advisory" },
  red:   { bg: "bg-red-100",   text: "text-red-800",   dot: "bg-red-500",   label: "Hold Active" },
};

const RULE_LABELS: Record<OshaRule, string> = {
  LIGHTNING_30_30:         "⚡ Lightning",
  HIGH_WIND_GENERAL:       "💨 High Wind",
  HIGH_WIND_MATERIAL_HANDLING: "💨 Wind (Material)",
  EXTREME_HEAT:            "🌡️ Extreme Heat",
};

const STATUS_TOOLTIPS: Partial<Record<SiteStatus, string>> = {
  amber: "Weather is approaching OSHA hold thresholds — being monitored but work can continue",
  green: "No active hold — conditions are within safe limits",
  red:   "OSHA weather hold is active — work must stop",
};

export function WeatherBadge({ status, rule }: Props) {
  const cfg = STATUS_CONFIG[status];
  const badge = (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {rule ? RULE_LABELS[rule] : cfg.label}
    </span>
  );
  const tip = STATUS_TOOLTIPS[status];
  return tip ? <Tooltip content={tip}>{badge}</Tooltip> : badge;
}
