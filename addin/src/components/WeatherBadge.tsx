import type { OshaRule, SiteStatus } from "../lib/types.js";

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

export function WeatherBadge({ status, rule }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {rule ? RULE_LABELS[rule] : cfg.label}
    </span>
  );
}
