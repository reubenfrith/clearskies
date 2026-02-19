import type { VehicleOnSite } from "../lib/types.js";

interface Props {
  vehicles: VehicleOnSite[];
}

export function VehicleList({ vehicles }: Props) {
  if (vehicles.length === 0) {
    return <p className="text-sm text-gray-500 italic">No vehicles confirmed on site at time of hold.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
            <th className="pb-2 pr-4">Vehicle</th>
            <th className="pb-2 pr-4">Driver</th>
            <th className="pb-2 pr-4">Phone</th>
            <th className="pb-2 pr-4">Speed</th>
            <th className="pb-2">GPS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vehicles.map((v) => (
            <tr key={v.device_id} className="hover:bg-gray-50">
              <td className="py-2 pr-4 font-medium">{v.device_name}</td>
              <td className="py-2 pr-4 text-gray-700">{v.driver_name ?? <span className="text-gray-400 italic">Unknown</span>}</td>
              <td className="py-2 pr-4 text-gray-700 font-mono text-xs">
                {v.phone_number ?? <span className="text-gray-400 italic">—</span>}
              </td>
              <td className="py-2 pr-4 text-gray-700">{v.speed} mph</td>
              <td className="py-2 text-xs text-gray-400 font-mono">
                {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
