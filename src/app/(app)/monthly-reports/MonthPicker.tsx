"use client";

import { useRouter } from "next/navigation";

// Month switcher for Monthly Reports. The month lives in the URL (?month=), so a
// link to a given month's reports can be shared and the page is server-rendered
// for it. Future months are not offered: they can only ever be empty.
function shift(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export default function MonthPicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const go = (key: string) => {
    if (!/^\d{4}-\d{2}$/.test(key) || key > max) return;
    router.push(`/monthly-reports?month=${key}`);
  };
  const next = shift(value, 1);
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className="btn-ghost" style={{ padding: "6px 10px" }} onClick={() => go(shift(value, -1))} aria-label="Previous month">
        ‹
      </button>
      <input
        type="month"
        className="input"
        style={{ width: 170 }}
        value={value}
        max={max}
        onChange={(e) => go(e.target.value)}
        aria-label="Report month"
      />
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 10px" }}
        onClick={() => go(next)}
        disabled={next > max}
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
