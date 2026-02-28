import { useEffect, useState } from "react";
import { Button, ButtonType, Table, MainColumn } from "@geotab/zenith";
import type { IListColumn } from "@geotab/zenith";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../lib/api.js";
import type { HoldRecord } from "../lib/types.js";
import { useGeotabApi } from "../lib/geotabContext.js";

const RULE_LABELS: Record<string, string> = {
  LIGHTNING_30_30: "Lightning (30/30)",
  HIGH_WIND_GENERAL: "High Wind — General",
  HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material",
  EXTREME_HEAT: "Extreme Heat",
};

const PAGE_SIZE = 25;

type HoldWithSite = HoldRecord & { site_name: string };

function durationLabel(hold: HoldRecord): string {
  if (!hold.all_clear_at) return "Active";
  const ms = new Date(hold.all_clear_at).getTime() - new Date(hold.triggered_at).getTime();
  const mins = Math.round(ms / 60_000);
  return `${mins} min`;
}

// Cast needed: React 18 expanded ReactNode to include bigint, but Zenith's TRenderResult predates this.
const columns = [
  {
    id: "site_name",
    title: "Site",
    columnComponent: new MainColumn<HoldWithSite>("site_name", false, {
      render: (h) => <span className="font-medium text-gray-900">{h.site_name}</span>,
    }),
  },
  {
    id: "trigger_rule",
    title: "Rule",
    columnComponent: new MainColumn<HoldWithSite>("trigger_rule", false, {
      render: (h) => <span>{RULE_LABELS[h.trigger_rule] ?? h.trigger_rule}</span>,
    }),
  },
  {
    id: "triggered_at",
    title: "Triggered",
    columnComponent: new MainColumn<HoldWithSite>("triggered_at", false, {
      render: (h) => (
        <span className="font-mono text-xs">{new Date(h.triggered_at).toLocaleString()}</span>
      ),
    }),
  },
  {
    id: "duration",
    title: "Duration",
    columnComponent: new MainColumn<HoldWithSite>("duration", false, {
      render: (h) => <span>{durationLabel(h)}</span>,
    }),
  },
  {
    id: "vehicles",
    title: "Vehicles",
    columnComponent: new MainColumn<HoldWithSite>("vehicles", false, {
      render: (h) => <span>{h.vehicles_on_site.length}</span>,
    }),
  },
  {
    id: "sms_sent",
    title: "SMS Sent",
    columnComponent: new MainColumn<HoldWithSite>("sms_sent", false, {
      render: (h) => (
        <span>{h.notifications_sent?.filter((n) => n.message_type === "hold").length ?? 0}</span>
      ),
    }),
  },
  {
    id: "issued_by",
    title: "Issued By",
    columnComponent: new MainColumn<HoldWithSite>("issued_by", false, {
      render: (h) => <span>{h.issued_by}</span>,
    }),
  },
  {
    id: "status",
    title: "Status",
    columnComponent: new MainColumn<HoldWithSite>("status", false, {
      render: (h) =>
        h.all_clear_at ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            Cleared
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
            Active
          </span>
        ),
    }),
  },
] as unknown as IListColumn<HoldWithSite>[];

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
      // Fetch all records (up to 500 per page; paginate if needed)
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
          String(h.vehicles_on_site.length),
          String(h.notifications_sent?.filter((n) => n.message_type === "hold").length ?? 0),
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compliance Log</h1>
          <p className="text-sm text-gray-500">
            Full OSHA weather hold history — {totalCount} event(s) recorded
          </p>
        </div>
        <Button type={ButtonType.Secondary} onClick={exportPDF} disabled={exporting || loading}>
          {exporting ? "Exporting…" : "Export PDF"}
        </Button>
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
          <Table entities={holds} columns={columns} isLoading={loading}>
            <Table.Empty>No hold events recorded yet.</Table.Empty>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <Button
                  type={ButtonType.Secondary}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  type={ButtonType.Secondary}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
