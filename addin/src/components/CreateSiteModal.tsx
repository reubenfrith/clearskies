import { useState } from "react";
import { Button, ButtonType } from "@geotab/zenith";
import type { GeotabApi } from "../geotab.js";
import { createGeotabZone } from "../lib/geotabZones.js";
import { api } from "../lib/api.js";

interface Props {
  geotabApi: GeotabApi;
  onDone: () => void;
  onClose: () => void;
}

export function CreateSiteModal({ geotabApi, onDone, onClose }: Props) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("200");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseInt(radius, 10);

    if (!name.trim()) return setError("Name is required.");
    if (isNaN(latNum) || isNaN(lngNum)) return setError("Latitude and longitude must be valid numbers.");
    if (isNaN(radiusNum) || radiusNum <= 0) return setError("Radius must be a positive number.");

    setSaving(true);
    try {
      const zoneId = await createGeotabZone(geotabApi, {
        name: name.trim(),
        address: address.trim() || undefined,
        lat: latNum,
        lng: lngNum,
        radiusMetres: radiusNum,
      });

      await api.createSite({
        name: name.trim(),
        address: address.trim() || undefined,
        lat: latNum,
        lng: lngNum,
        geotab_zone_id: zoneId,
        radius_m: radiusNum,
      });

      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Site</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Site name *">
            <input
              className="zen-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downtown Tower"
              required
            />
          </Field>

          <Field label="Address (optional)">
            <input
              className="zen-input w-full"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Chicago, IL"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude *">
              <input
                className="zen-input w-full"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="41.8781"
                type="number"
                step="any"
                required
              />
            </Field>
            <Field label="Longitude *">
              <input
                className="zen-input w-full"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-87.6298"
                type="number"
                step="any"
                required
              />
            </Field>
          </div>

          <Field label="Radius (metres)">
            <input
              className="zen-input w-full"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              type="number"
              min="10"
              step="10"
            />
          </Field>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type={ButtonType.Secondary} onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create Site"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
