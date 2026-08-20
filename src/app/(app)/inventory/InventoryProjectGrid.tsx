"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { DISTRICTS } from "@/lib/options";

// One project as rendered in the admin Inventory card grid. Mirrors the card
// design used on the Bookings & Blocking project picker.
export interface GridProject {
  id: string;
  name: string;
  city: string;
  district: string;
  status: string;
  // The headline number: on the sales screens this is AVAILABLE plots, on the
  // admin screens it is simply how many plots the project has.
  plots: number;
  // Optional denominator. When set, the card reads "86/103" — how much of the
  // project is still open, not just how much is left. Omitted on screens where
  // `plots` is already the total and a ratio would read as "103/103".
  totalPlots?: number;
}

const STATUS_TONE: Record<string, "green" | "gray" | "amber" | "red"> = {
  active: "green",
  draft: "gray",
  on_hold: "amber",
  closed: "red",
};

// Section heading for a district partition, with its own running totals so each
// branch can read its inventory at a glance without adding up the cards.
function DistrictHeading({ label, projects }: { label: string; projects: GridProject[] }) {
  const avail = projects.reduce((n, p) => n + p.plots, 0);
  // Only meaningful if every project in the section carries a denominator.
  const total = projects.every((p) => p.totalPlots != null)
    ? projects.reduce((n, p) => n + (p.totalPlots ?? 0), 0)
    : null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2">
      <h3 className="text-sm font-semibold text-[var(--text)]">{label}</h3>
      <span className="text-xs text-[var(--muted)]">
        {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
        <span className="tabular-nums">
          {avail}
          {total != null ? `/${total}` : ""}
        </span>{" "}
        plot{avail === 1 && total == null ? "" : "s"}
      </span>
    </div>
  );
}

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
  variant = "grid",
  priorityDistrict,
  groupByDistrict = false,
}: {
  projects: GridProject[];
  hrefBase?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  title?: string;
  emptyHint?: string;
  // "grid" = card grid (3-up); "list" = one compact full-width row per project.
  variant?: "grid" | "list";
  // When set, projects in this district float to the top (used by the sales panel).
  priorityDistrict?: string;
  // Split the results into one section per district instead of a single flat
  // run of cards. Sales browse by branch ("what do we have in Trichy?"), so the
  // boundary is worth showing rather than leaving implied by the sort order.
  groupByDistrict?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("avail_desc");

  const q = search.trim().toLowerCase();
  const pd = (priorityDistrict ?? "").trim().toLowerCase();
  const visible = projects
    .filter(
      (p) =>
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      if (pd) {
        const am = a.district.toLowerCase() === pd ? 0 : 1;
        const bm = b.district.toLowerCase() === pd ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      return sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "avail_asc"
          ? a.plots - b.plots
          : b.plots - a.plots;
    });

  // District sections, ordered: the viewer's own district first, then the
  // app-wide master order (Chennai, Trichy), then anything unrecognised —
  // including projects with no district at all, which must not vanish.
  const sections: { label: string; projects: GridProject[] }[] = [];
  if (groupByDistrict) {
    const byDistrict = new Map<string, GridProject[]>();
    for (const p of visible) {
      const key = p.district?.trim() || "Other";
      const list = byDistrict.get(key) ?? [];
      list.push(p);
      byDistrict.set(key, list);
    }
    const rank = (d: string) => {
      if (pd && d.toLowerCase() === pd) return -1;
      const i = DISTRICTS.findIndex((x) => x.toLowerCase() === d.toLowerCase());
      return i === -1 ? DISTRICTS.length : i;
    };
    sections.push(
      ...[...byDistrict.entries()]
        .map(([label, list]) => ({ label, projects: list }))
        .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label)),
    );
  }

  // "86/103" — available over total. The denominator stays muted so the number
  // that matters (what can still be sold) keeps the emphasis.
  function count(p: GridProject, size: "sm" | "lg") {
    const big = size === "lg" ? "text-lg font-semibold" : "text-sm font-semibold";
    // Exactly two flex children, so the parent's gap falls between the ratio and
    // the word — "86/103" stays tight rather than reading as "86 / 103".
    return (
      <>
        <span className="flex items-baseline">
          <span className={`tabular-nums text-[var(--accent)] ${big}`}>{p.plots}</span>
          {p.totalPlots != null && (
            <span className="text-xs tabular-nums text-[var(--muted)]">/{p.totalPlots}</span>
          )}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {p.totalPlots != null ? "plots" : `plot${p.plots === 1 ? "" : "s"}`}
        </span>
      </>
    );
  }

  function card(p: GridProject) {
    const selected = selectedId === p.id;
    // Under a district heading the card's own "· Trichy" is noise — and for the
    // many projects whose city IS their district it rendered as "Trichy · Trichy".
    const sub = groupByDistrict || !p.district ? p.city : `${p.city} · ${p.district}`;
    const inner =
      variant === "list" ? (
        <div className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0 truncate">
            <span className="font-medium text-[var(--text)]">{p.name}</span>
            <span className="ml-2 text-xs text-[var(--muted)]">{sub}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex items-baseline gap-1">{count(p, "sm")}</span>
            <Badge tone={STATUS_TONE[p.status] ?? "gray"}>{p.status.replace(/_/g, " ")}</Badge>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium leading-tight text-[var(--text)]">{p.name}</div>
            <Badge tone={STATUS_TONE[p.status] ?? "gray"}>{p.status.replace(/_/g, " ")}</Badge>
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>
          <div className="mt-4 flex items-baseline gap-1.5 border-t border-[var(--border)] pt-3">
            {count(p, "lg")}
          </div>
        </>
      );
    const className =
      variant === "list"
        ? `card block w-full text-left transition hover:border-[var(--accent)] ${
            selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""
          }`
        : `card block w-full text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] ${
            selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""
          }`;
    const style = variant === "list" ? { padding: "12px 16px" } : undefined;
    return hrefBase ? (
      <Link key={p.id} href={`${hrefBase}/${p.id}`} className={className} style={style}>
        {inner}
      </Link>
    ) : (
      <button key={p.id} type="button" onClick={() => onSelect?.(p.id)} className={className} style={style}>
        {inner}
      </button>
    );
  }

  const layout = variant === "list" ? "space-y-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

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
      ) : groupByDistrict ? (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.label} className="space-y-3">
              <DistrictHeading label={s.label} projects={s.projects} />
              <div className={layout}>{s.projects.map(card)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className={layout}>{visible.map(card)}</div>
      )}
    </div>
  );
}
