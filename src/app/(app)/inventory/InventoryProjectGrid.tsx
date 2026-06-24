"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

// One project as rendered in the admin Inventory card grid. Mirrors the card
// design used on the Bookings & Blocking project picker.
export interface GridProject {
  id: string;
  name: string;
  city: string;
  district: string;
  status: string;
  plots: number;
}

const STATUS_TONE: Record<string, "green" | "gray" | "amber" | "red"> = {
  active: "green",
  draft: "gray",
  on_hold: "amber",
  closed: "red",
};

// Searchable + sortable grid of project cards. Two modes:
//   • link mode   — pass `hrefBase`, each card links to `${hrefBase}/${id}`
//                   (used by Manage). A string, so it's safe to pass from a
//                   server component.
//   • select mode — pass `onSelect`, each card is a <button> (used by Add Plots).
export default function InventoryProjectGrid({
  projects,
  hrefBase,
  onSelect,
  selectedId,
  title = "Select a Project",
  emptyHint,
}: {
  projects: GridProject[];
  hrefBase?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  title?: string;
  emptyHint?: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("avail_desc");

  const q = search.trim().toLowerCase();
  const visible = projects
    .filter(
      (p) =>
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "avail_asc"
          ? a.plots - b.plots
          : b.plots - a.plots,
    );

  return (
    <div className="space-y-5">
      {/* Left-aligned toolbar: title, then search + sort. */}
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-[var(--muted)]">
            {visible.length} shown
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input"
            style={{ maxWidth: 320, flex: "1 1 240px" }}
            placeholder="Search projects (name / city)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            style={{ maxWidth: 200 }}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="avail_desc">Most plots</option>
            <option value="avail_asc">Fewest plots</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {emptyHint ?? "No projects match your search."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium leading-tight text-[var(--text)]">{p.name}</div>
                  <Badge tone={STATUS_TONE[p.status] ?? "gray"}>
                    {p.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {p.city}
                  {p.district ? ` · ${p.district}` : ""}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5 border-t border-[var(--border)] pt-3">
                  <span className="text-lg font-semibold tabular-nums text-[var(--accent)]">
                    {p.plots}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    plot{p.plots === 1 ? "" : "s"}
                  </span>
                </div>
              </>
            );
            const selected = selectedId === p.id;
            const className = `card block w-full text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] ${
              selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""
            }`;
            return hrefBase ? (
              <Link key={p.id} href={`${hrefBase}/${p.id}`} className={className}>
                {inner}
              </Link>
            ) : (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect?.(p.id)}
                className={className}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
