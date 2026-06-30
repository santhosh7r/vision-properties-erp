"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import { PlotStatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createPlot, createPlotCategory } from "../../plots/actions";
import InventoryProjectGrid from "../InventoryProjectGrid";

export interface WorkspaceProject {
  id: string;
  name: string;
  city: string;
  district: string;
  status: string;
  groups: { id: string; name: string }[];
  plots: {
    id: string;
    plot_no: string;
    sqft: number;
    price_per_sqft: number;
    status: string;
    plot_category_id: string | null;
  }[];
}

export default function AddPlotsWorkspace({ projects }: { projects: WorkspaceProject[] }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId) ?? null;

  // ── Step 1: pick a project ────────────────────────────────────────────────
  if (!project) {
    return (
      <InventoryProjectGrid
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          city: p.city,
          district: p.district,
          status: p.status,
          plots: p.plots.length,
        }))}
        onSelect={setProjectId}
      />
    );
  }

  // ── Step 2: add plots / categories to the chosen project ──────────────────
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setProjectId(null)}
          className="btn-ghost"
          style={{ padding: "5px 12px", fontSize: 13 }}
        >
          ← Back to projects
        </button>
        <div>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <p className="text-xs text-[var(--muted)]">
            {project.city} · {project.plots.length} plot{project.plots.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="card">
        <h3 className="mb-3 text-sm font-semibold">
          Plot Categories ({project.groups.length})
        </h3>
        {project.groups.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {project.groups.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                {g.name}
              </span>
            ))}
          </div>
        )}
        <form action={createPlotCategory} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="project_id" value={project.id} />
          <div className="flex-1" style={{ minWidth: 160 }}>
            <label className="label">New category name</label>
            <input
              name="name"
              className="input"
              placeholder="e.g. Phase 1, Premium, Corner"
              required
            />
          </div>
          <SubmitButton className="btn-ghost" pendingLabel="Adding…">
            Add Category
          </SubmitButton>
        </form>
      </div>

      {/* Add plot */}
      <div className="card">
        <h3 className="mb-3 text-sm font-semibold">Add Plot</h3>
        {project.groups.length === 0 ? (
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Add a <span className="font-medium">Block (category)</span> first — every plot must
            belong to one. Use the form above to create a block, then add plots to it.
          </div>
        ) : (
          <form action={createPlot} className="grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="project_id" value={project.id} />
            <div className="sm:col-span-2">
              <label className="label">Block *</label>
              <select name="plot_category_id" className="select" defaultValue="" required>
                <option value="" disabled>
                  — Select a block —
                </option>
                {project.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Plot No *</label>
              <input name="plot_no" className="input" required />
            </div>
            <div>
              <label className="label">Plot Sq.ft *</label>
              <input name="sqft" type="number" min={1} step="0.01" className="input" required />
            </div>
            <div>
              <label className="label">Current Status</label>
              <select name="status" className="select" defaultValue="available">
                <option value="available">Vacant</option>
                <option value="blocked">Not Vacant</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <label className="label">Description</label>
              <input name="description" className="input" placeholder="Description (optional)" />
            </div>
            <div className="flex items-end">
              <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">Add</SubmitButton>
            </div>
          </form>
        )}
      </div>

      {/* Existing plots, card design */}
      {project.plots.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No plots yet for this project.</p>
      ) : (
        <div>
          <h3 className="mb-3 text-sm font-semibold">
            Plots <span className="text-[var(--muted)]">({project.plots.length})</span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {project.plots.map((pl) => (
              <div
                key={pl.id}
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{pl.plot_no}</div>
                  <PlotStatusBadge status={pl.status} />
                </div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">
                  {pl.sqft} sq.ft · {inr(pl.sqft * pl.price_per_sqft)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
