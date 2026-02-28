import { useState } from "react";
import { api } from "../lib/api.js";
import type { NearbyVehicle } from "../pages/HoldManagement.js";

interface Props {
  siteId: string;
  siteName: string;
  vehicles: NearbyVehicle[];
  onClose: () => void;
  onSent: () => void;
}

type Step = "compose" | "sending" | "results";

interface DeviceResult {
  device_id: string;
  status: string;
  geotab_message_id: string | null;
}

export function SendMessageModal({ siteId, siteName, vehicles, onClose, onSent }: Props) {
  const [step, setStep] = useState<Step>("compose");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(vehicles.map((v) => v.deviceId))
  );
  const [results, setResults] = useState<DeviceResult[]>([]);

  const deviceNameById = new Map(vehicles.map((v) => [v.deviceId, v.deviceName]));

  function toggleDevice(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!message.trim() || selected.size === 0) return;
    setStep("sending");
    try {
      const res = await api.sendCustomMessage(siteId, {
        message: message.trim(),
        device_ids: Array.from(selected),
      });
      setResults(res);
    } catch (err) {
      setResults(
        Array.from(selected).map((id) => ({
          device_id: id,
          status: `failed: ${err}`,
          geotab_message_id: null,
        }))
      );
    }
    setStep("results");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">📨 Send Message</h2>
        <p className="text-sm text-gray-500 mb-4">{siteName}</p>

        {step === "compose" && (
          <>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
              <textarea
                className="zen-input w-full h-24 resize-none"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Weather clearing, resume shortly"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Send to ({selected.size} selected)
              </label>
              {vehicles.length === 0 ? (
                <p className="text-sm text-amber-600 italic">No vehicles nearby to send to.</p>
              ) : (
                <div className="border rounded max-h-40 overflow-y-auto divide-y divide-gray-100">
                  {vehicles.map((v) => (
                    <label
                      key={v.deviceId}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(v.deviceId)}
                        onChange={() => toggleDevice(v.deviceId)}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-800">{v.deviceName}</span>
                      {v.driverName && (
                        <span className="text-xs text-gray-500">— {v.driverName}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || selected.size === 0 || vehicles.length === 0}
                className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Send to {selected.size} vehicle{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}

        {step === "sending" && (
          <div className="flex items-center gap-3 py-4 text-sm text-gray-600">
            <span className="animate-spin inline-block text-blue-500 text-lg">⟳</span>
            Sending to {selected.size} vehicle{selected.size !== 1 ? "s" : ""}…
          </div>
        )}

        {step === "results" && (
          <>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-1 font-medium">Device</th>
                  <th className="pb-1 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const sent = r.status === "sent";
                  return (
                    <tr key={r.device_id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-800">
                        {deviceNameById.get(r.device_id) ?? r.device_id}
                      </td>
                      <td className="py-1.5 text-right">
                        <span
                          title={!sent ? r.status : undefined}
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            sent
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700 cursor-help"
                          }`}
                        >
                          {sent ? "✓ Sent" : "✗ Failed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end">
              <button
                onClick={() => { onSent(); onClose(); }}
                className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
