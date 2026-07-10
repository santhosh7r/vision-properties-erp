"use client";

import { useEffect, useState } from "react";

// Live deadline countdown for an active hold's `expires_at`.
//   blocking window (e.g. 48h) · booking window (e.g. 15d)
// Shows "Nd Nh" when more than a day out, else "Nh Nm", ticking every 30s so an
// open list stays accurate without a refresh. Amber under 6h, red once overdue
// (the lazy expiry sweep releases the plot on the next list load). Renders "—"
// when there is no deadline (a confirmed hold clears `expires_at`).
export default function Countdown({
  deadline,
  className = "",
}: {
  deadline: string | null | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return <span className="text-[var(--muted)]">—</span>;

  const ms = new Date(deadline).getTime() - now;
  const abs = new Date(deadline).toLocaleString();

  if (ms <= 0) {
    return (
      <span suppressHydrationWarning className={`font-medium text-red-500 ${className}`} title={`Deadline was ${abs}`}>
        Expired
      </span>
    );
  }

  const totalMins = Math.floor(ms / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  const label = days >= 1 ? `${days}d ${hours}h` : hours >= 1 ? `${hours}h ${mins}m` : `${mins}m`;

  const tone = ms < 6 * 3_600_000 ? "text-amber-500" : "text-[var(--text)]";

  return (
    <span
      suppressHydrationWarning
      className={`tabular-nums font-medium ${tone} ${className}`}
      title={`Plot returns to the company at ${abs} if not ${"paid / converted"} in time`}
    >
      {label} left
    </span>
  );
}
