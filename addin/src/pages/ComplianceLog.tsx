import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { HoldRecord, Site } from "../lib/types.js";

const RULE_LABELS: Record<string, string> = {
  LIGHTNING_30_30: "Lightning (30/30)",
  HIGH_WIND_GENERAL: "High Wind — General",
  HIGH_WIND_MATERIAL_HANDLING: "High Wind — Material",
  EXTREME_HEAT: "Extreme Heat",
};

const PAGE_SIZE = 25;

export function ComplianceLog() {
  const [holds, setHolds] = useState<(HoldRecord & { site_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const [{ data: holdsData, error: holdsErr, count }, { data: sitesData, error: sitesErr }] =
          await Promise.all([
            supabase
              .from("holds_log")
              .select("*", { count: "exact" })
              .order("triggered_at", { ascending: false })
              .range(from, to),
            supabase.from("sites").select("id, name"),
          ]);

        if (holdsErr) throw new Error(holdsErr.message);
        if (sitesErr) throw new Error(sitesErr.message);

        const siteMap = new Map<string, string>();
        for (const s of (sitesData ?? []) as Site[]) {
          siteMap.set(s.id, s.name);
        }

        const enriched = (holdsData as HoldRecord[]).map((h) => ({
          ...h,
          site_name: siteMap.get(h.site_id) ?? "Unknown site",
        }));

        setHolds(enriched);
        setTotalCount(count ?? 0);
        setError(null);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page]);

  function durationLabel(hold: HoldRecord): string {
    if (!hold.all_clear_at) return "Active";
    const ms = new Date(hold.all_clear_at).getTime() - new Date(hold.triggered_at).getTime();
    const mins = Math.round(ms / 60_000);
    return `${mins} min`;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Compliance Log</h1>
        <p className="text-sm text-gray-500">
          Full OSHA weather hold history — {totalCount} event(s) recorded
        </p>
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
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm bg-white">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Triggered</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Vehicles</th>
                  <th className="px-4 py-3">SMS Sent</th>
                  <th className="px-4 py-3">Issued By</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holds.map((hold) => (
                  <tr key={hold.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{hold.site_name}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {RULE_LABELS[hold.trigger_rule] ?? hold.trigger_rule}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-mono text-xs">
                      {new Date(hold.triggered_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {durationLabel(hold)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-center">
                      {hold.vehicles_on_site.length}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-center">
                      {hold.notifications_sent?.filter((n) => n.message_type === "hold").length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{hold.issued_by}</td>
                    <td className="px-4 py-3">
                      {hold.all_clear_at ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Cleared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
