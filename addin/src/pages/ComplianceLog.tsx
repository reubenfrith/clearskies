import { useEffect, useState } from "react";
import { Button, ButtonType } from "@geotab/zenith";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../lib/api.js";
import type { HoldRecord } from "../lib/types.js";
import { useGeotabApi } from "../lib/geotabContext.js";
import { Tooltip } from "../components/Tooltip.js";

const RULE_LABELS: Record<string, string> = {
  LIGHTNING_30_30: "Lightning (30/30)",
  HIGH_WIND_GENERAL: "High Wind — General",
  HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material",
  EXTREME_HEAT: "Extreme Heat",
};

const RULE_BADGE: Record<string, string> = {
  LIGHTNING_30_30:             "bg-amber-100 text-amber-800",
  HIGH_WIND_GENERAL:           "bg-blue-100 text-blue-800",
  HIGH_WIND_MATERIAL_HANDLING: "bg-blue-100 text-blue-800",
  EXTREME_HEAT:                "bg-orange-100 text-orange-800",
};

const PAGE_SIZE = 25;

type HoldWithSite = HoldRecord & { site_name: string };

function durationLabel(hold: HoldRecord): string {
  if (!hold.all_clear_at) return "Active";
  const ms = new Date(hold.all_clear_at).getTime() - new Date(hold.triggered_at).getTime();
  const mins = Math.round(ms / 60_000);
  return `${mins} min`;
}

export function ComplianceLog() {
  const { session } = useGeotabApi();
  const [holds, setHolds] = useState<HoldWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  async function exportPDF() {
    setExporting(true);
    try {
      let allHolds: HoldWithSite[] = [];
      let fetchPage = 0;
      while (true) {
        const { items, total } = await api.getHolds(fetchPage, 500);
        allHolds = allHolds.concat(items as HoldWithSite[]);
        if (allHolds.length >= total) break;
        fetchPage++;
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const dateStr = new Date().toLocaleDateString();

      doc.setFontSize(16);
      doc.text("ClearSkies — OSHA Weather Hold Compliance Report", 14, 16);
      doc.setFontSize(10);
      doc.text(`Generated: ${dateStr} | Total events: ${allHolds.length}`, 14, 24);

      autoTable(doc, {
        startY: 30,
        head: [["Site", "Rule", "Triggered", "Duration", "Vehicles on Site", "Alerts Sent", "Issued By", "Status"]],
        body: allHolds.map((h) => [
          h.site_name,
          RULE_LABELS[h.trigger_rule] ?? h.trigger_rule,
          new Date(h.triggered_at).toLocaleString(),
          durationLabel(h),
          String(Array.isArray(h.vehicles_on_site) ? h.vehicles_on_site.length : 0),
          String(Array.isArray(h.notifications_sent) ? h.notifications_sent.filter((n) => n.message_type === "hold").length : 0),
          h.issued_by,
          h.all_clear_at ? "Cleared" : "Active",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 138] },
      });

      const fileName = `clearskies-compliance-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      alert(`Export failed: ${err}`);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    async function load() {
      setLoading(true);
      try {
        const { items, total } = await api.getHolds(page, PAGE_SIZE);
        setHolds(items as HoldWithSite[]);
        setTotalCount(total);
        setError(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page, session]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compliance Log</h1>
          <p className="text-sm text-gray-500">
            Full OSHA weather hold history — {totalCount} event(s) recorded
          </p>
        </div>
        <Tooltip content="Download all hold events as an OSHA-compliant landscape PDF report" position="bottom">
          <Button type={ButtonType.Secondary} onClick={exportPDF} disabled={exporting || loading}>
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>
        </Tooltip>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="text-sm text-gray-500 animate-pulse">Loading hold records…</div>
      )}

      {!loading && holds.length === 0 && (
        <p className="text-sm text-gray-500 italic">No hold events recorded yet.</p>
      )}

      {!loading && holds.length > 0 && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {(["Site", "Rule", "Triggered", "Duration", "Vehicles", "Alerts", "Issued By", "Status"] as const).map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holds.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                      {/* Site */}
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {h.site_name}
                      </td>

                      {/* Rule */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${RULE_BADGE[h.trigger_rule] ?? "bg-gray-100 text-gray-700"}`}>
                          {RULE_LABELS[h.trigger_rule] ?? h.trigger_rule}
                        </span>
                      </td>

                      {/* Triggered */}
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(h.triggered_at).toLocaleString()}
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {h.all_clear_at ? (
                          <span className="text-gray-700">{durationLabel(h)}</span>
                        ) : (
                          <span className="text-red-600 font-medium">Active</span>
                        )}
                      </td>

                      {/* Vehicles */}
                      <td className="px-4 py-3 text-gray-700">
                        {Array.isArray(h.vehicles_on_site) ? h.vehicles_on_site.length : 0}
                      </td>

                      {/* Alerts sent */}
                      <td className="px-4 py-3 text-gray-700">
                        {Array.isArray(h.notifications_sent)
                          ? h.notifications_sent.filter((n) => n.message_type === "hold").length
                          : 0}
                      </td>

                      {/* Issued by */}
                      <td className="px-4 py-3 max-w-[160px] truncate" title={h.issued_by}>
                        {h.issued_by === "auto" ? (
                          <span className="text-xs text-gray-400 italic">auto</span>
                        ) : (
                          <span className="text-xs text-gray-600">{h.issued_by}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {h.all_clear_at ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            ✓ Cleared
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
                            ● Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Page {page + 1} of {totalPages} · {totalCount} total events
              </span>
              <div className="flex gap-2">
                <Button
                  type={ButtonType.Secondary}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← Previous
                </Button>
                <Button
                  type={ButtonType.Secondary}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
