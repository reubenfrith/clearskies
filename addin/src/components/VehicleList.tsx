import { Table, MainColumn } from "@geotab/zenith";
import type { IListColumn } from "@geotab/zenith";
import type { VehicleOnSite } from "../lib/types.js";

interface Props {
  vehicles: VehicleOnSite[];
}

type VehicleRow = VehicleOnSite & { id: string };

// Cast needed: React 18 expanded ReactNode to include bigint, but Zenith's TRenderResult predates this.
const columns = [
  {
    id: "device_name",
    title: "Vehicle",
    columnComponent: new MainColumn<VehicleRow>("device_name", false, {
      render: (v) => <span className="font-medium">{v.device_name}</span>,
    }),
  },
  {
    id: "driver_name",
    title: "Driver",
    columnComponent: new MainColumn<VehicleRow>("driver_name", false, {
      render: (v) =>
        v.driver_name
          ? <span>{v.driver_name}</span>
          : <span className="text-gray-400 italic">Unknown</span>,
    }),
  },
  {
    id: "phone_number",
    title: "Phone",
    columnComponent: new MainColumn<VehicleRow>("phone_number", false, {
      render: (v) =>
        v.phone_number
          ? <span className="font-mono text-xs">{v.phone_number}</span>
          : <span className="text-gray-400 italic">—</span>,
    }),
  },
  {
    id: "speed",
    title: "Speed",
    columnComponent: new MainColumn<VehicleRow>("speed", false, {
      render: (v) => <span>{v.speed} mph</span>,
    }),
  },
  {
    id: "gps",
    title: "GPS",
    columnComponent: new MainColumn<VehicleRow>("gps", false, {
      render: (v) => (
        <span className="text-xs text-gray-400 font-mono">
          {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
        </span>
      ),
    }),
  },
] as unknown as IListColumn<VehicleRow>[];

export function VehicleList({ vehicles }: Props) {
  if (vehicles.length === 0) {
    return <p className="text-sm text-gray-500 italic">No vehicles confirmed on site at time of hold.</p>;
  }

  const rows: VehicleRow[] = vehicles.map((v) => ({ ...v, id: v.device_id }));

  return (
    <Table entities={rows} columns={columns}>
      <Table.Empty>No vehicles confirmed on site at time of hold.</Table.Empty>
    </Table>
  );
}
