"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import BookingForm from "./new/BookingForm";

export interface FlowPlot {
  id: string;
  plot_no: string;
  sqft: number;
  price_per_sqft: number;
  plot_category_id: string | null;
}
export interface FlowProject {
  id: string;
  name: string;
  city: string;
  advance_percent: number;
  advance_min_amount: number;
  blocking_amount: number;
  blocking_window_hours: number;
  booking_window_days: number;
  groups: { id: string; name: string }[];
  plots: FlowPlot[];
}
interface MiniCustomer { id: string; name: string; mobile: string }

export default function StartBookingFlow({
  projects,
  customers,
  canBlock = true,
  canBook = false,
}: {
  projects: FlowProject[];
  customers: MiniCustomer[];
  canBlock?: boolean;
  canBook?: boolean;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ plot: FlowPlot; mode: "blocking" | "booking" } | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectSort, setProjectSort] = useState("avail_desc");
  const [plotSearch, setPlotSearch] = useState("");
  const [plotCat, setPlotCat] = useState("all");

  const project = projects.find((p) => p.id === projectId) ?? null;

  function openProject(id: string) {
    setProjectId(id);
    setPlotSearch("");
    setPlotCat("all");
  }

  // ── Step 3: the booking form for the chosen plot ────────────────────────────
  if (project && selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {selected.mode === "blocking" ? "New Blocking" : "New Booking"} — {project.name} · Plot{" "}
            {selected.plot.plot_no}
          </h2>
          <button type="button" onClick={() => setSelected(null)} className="btn-ghost">
            ← Back to plots
          </button>
        </div>
        <BookingForm
          mode={selected.mode}
          plot={{
            id: selected.plot.id,
            plot_no: selected.plot.plot_no,
            sqft: selected.plot.sqft,
            price_per_sqft: selected.plot.price_per_sqft,
          }}
          project={{
            name: project.name,
            advance_percent: project.advance_percent,
            advance_min_amount: project.advance_min_amount,
            blocking_amount: project.blocking_amount,
            blocking_window_hours: project.blocking_window_hours,
            booking_window_days: project.booking_window_days,
          }}
          customers={customers}
        />
      </div>
    );
  }

  // ── Step 2: plots of the chosen project, searchable + category filter ───────
  if (project) {
    const UNCAT = "__uncat__";
    const q = plotSearch.trim().toLowerCase();
    const filtered = project.plots.filter((pl) => {
      const inCat =
        plotCat === "all"
          ? true
          : plotCat === UNCAT
            ? !pl.plot_category_id
            : pl.plot_category_id === plotCat;
      const inSearch = q === "" || pl.plot_no.toLowerCase().includes(q);
      return inCat && inSearch;
    });

    const buckets = [
      ...project.groups.map((g) => ({
        id: g.id,
        name: g.name,
        items: filtered.filter((pl) => pl.plot_category_id === g.id),
      })),
      { id: null as string | null, name: "Uncategorised", items: filtered.filter((pl) => !pl.plot_category_id) },
    ].filter((b) => b.items.length > 0);

    const hasUncat = project.plots.some((pl) => !pl.plot_category_id);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{project.name}</h2>
            <p className="text-xs text-[var(--muted)]">
              {project.city} · {project.plots.length} available plot{project.plots.length === 1 ? "" : "s"} ·
              Block {inr(project.blocking_amount)} / Book {project.advance_percent}% advance
            </p>
          </div>
          <button type="button" onClick={() => setProjectId(null)} className="btn-ghost">
            ← Back to projects
          </button>
        </div>

        {/* search + category filter */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search plots (plot no)…"
            value={plotSearch}
            onChange={(e) => setPlotSearch(e.target.value)}
          />
          <select className="select" style={{ maxWidth: 220 }} value={plotCat} onChange={(e) => setPlotCat(e.target.value)}>
            <option value="all">All categories</option>
            {project.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
            {hasUncat && <option value={UNCAT}>Uncategorised</option>}
          </select>
          <span className="text-xs text-[var(--muted)]">{filtered.length} shown</span>
        </div>

        {buckets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No plots match your search.</p>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.id ?? "none"} className="card">
              <h3 className="mb-3 text-sm font-semibold">
                {bucket.name} <span className="text-[var(--muted)]">({bucket.items.length})</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bucket.items.map((pl) => (
                  <div key={pl.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{pl.plot_no}</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {pl.sqft} sq.ft · {inr(pl.sqft * pl.price_per_sqft)}
                    </div>
                    <div className="mt-3 flex gap-2">
                      {canBlock && (
                        <button
                          type="button"
                          onClick={() => setSelected({ plot: pl, mode: "blocking" })}
                          className={`flex-1 ${canBook ? "btn-ghost" : "btn-primary"}`}
                          style={{ fontSize: 12, padding: "6px 10px" }}
                        >
                          Block
                        </button>
                      )}
                      {canBook && (
                        <button
                          type="button"
                          onClick={() => setSelected({ plot: pl, mode: "booking" })}
                          className="btn-primary flex-1"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                        >
                          Book
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // ── Step 1: pick a project, searchable ──────────────────────────────────────
  const pq = projectSearch.trim().toLowerCase();
  const visibleProjects = projects
    .filter((p) => pq === "" || p.name.toLowerCase().includes(pq) || p.city.toLowerCase().includes(pq))
    .sort((a, b) =>
      projectSort === "name"
        ? a.name.localeCompare(b.name)
        : projectSort === "avail_asc"
          ? a.plots.length - b.plots.length
          : b.plots.length - a.plots.length,
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Select a Project</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Search projects (name / city)…"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
          />
          <select
            className="select"
            style={{ maxWidth: 200 }}
            value={projectSort}
            onChange={(e) => setProjectSort(e.target.value)}
          >
            <option value="avail_desc">Most available plots</option>
            <option value="avail_asc">Fewest available plots</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
      </div>
      {visibleProjects.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No projects match your search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openProject(p.id)}
              className="card text-left transition hover:border-[var(--accent)]"
            >
              <div className="font-medium">{p.name}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{p.city}</div>
              <div className="mt-3 text-sm">
                <span className="font-semibold">{p.plots.length}</span>{" "}
                <span className="text-[var(--muted)]">available plot{p.plots.length === 1 ? "" : "s"}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
