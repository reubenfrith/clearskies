import { useEffect, useState } from "react";

interface Props {
  triggeredAt: string;
  holdDurationMins: number; // timed holds only
}

function formatMmSs(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function CountdownTimer({ triggeredAt, holdDurationMins }: Props) {
  const endMs = new Date(triggeredAt).getTime() + holdDurationMins * 60 * 1000;

  const [remaining, setRemaining] = useState(endMs - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(endMs - Date.now()), 1000);
    return () => clearInterval(id);
  }, [endMs]);

  const expired = remaining <= 0;

  return (
    <div className={`font-mono text-2xl font-bold tabular-nums ${expired ? "text-green-600" : "text-red-600"}`}>
      {expired ? "Elapsed — awaiting all-clear" : formatMmSs(remaining)}
    </div>
  );
}
