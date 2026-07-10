"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import { APPROVAL_TYPES, DISTRICTS, PROJECT_TYPES } from "@/lib/options";
import { Badge, PlotStatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { Project } from "@/lib/types";
import PolicyFields from "../../../projects/PolicyFields";
import DeleteProjectButton from "../../../projects/[id]/DeleteProjectButton";
import { updateProject } from "../../../projects/actions";
import { createPlot, createPlotCategory, updatePlot, deletePlot } from "../../../plots/actions";

export interface EditPlot {
  id: string;
  plot_no: string;
  sqft: number;
  price_per_sqft: number;
  plot_category_id: string | null;
  description: string | null;
  status: string;
}
export interface EditCategory {
  id: string;
  name: string;
}

type Tab = "project" | "plots";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }
          : { background: "transparent", color: "var(--muted)" }
      }
    >
      {children}
    </button>
  );
}

export default function ManageProjectClient({
  project,
  categories,
  plots,
}: {
  project: Project;
  categories: EditCategory[];
  plots: EditPlot[];
}) {
  const [tab, setTab] = useState<Tab>("project");
  const [plotSearch, setPlotSearch] = useState("");

  const q = plotSearch.trim().toLowerCase();
  const visiblePlots =
    q === ""
      ? plots
      : plots.filter(
          (p) =>
            p.plot_no.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
        );

  return (
    <div className="space-y-5">
      <div
        className="inline-flex gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <TabButton active={tab === "project"} onClick={() => setTab("project")}>
          Project Details
        </TabButton>
        <TabButton active={tab === "plots"} onClick={() => setTab("plots")}>
          Plots ({plots.length})
        </TabButton>
      </div>

      {tab === "project" ? (
        <form action={updateProject} className="max-w-3xl space-y-6">
          <input type="hidden" name="id" value={project.id} />
          <div className="card">
            <h2 className="mb-4 text-sm font-semibold">Project Details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Name *</label>
                <input name="name" className="input" required defaultValue={project.name} />
              </div>
              <div>
                <label className="label">District *</label>
                <select name="district" className="select" required defaultValue={project.district}>
                  <option value="" disabled>— Select district —</option>
                  {project.district && !DISTRICTS.includes(project.district) && (
                    <option value={project.district}>{project.district}</option>
                  )}
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">City *</label>
                <input name="city" className="input" required defaultValue={project.city} />
              </div>
              <div>
                <label className="label">Pincode</label>
                <input name="pincode" className="input" inputMode="numeric" maxLength={6} placeholder="6-digit PIN" defaultValue={project.pincode ?? ""} />
              </div>
              <div>
                <label className="label">Extent *</label>
                <input name="area" className="input" required defaultValue={project.area} />
              </div>
              <div>
                <label className="label">Approval *</label>
                <select name="approval_type" className="select" required defaultValue={project.approval_type}>
                  {APPROVAL_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type *</label>
                <select name="project_type" className="select" required defaultValue={project.project_type}>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select name="status" className="select" defaultValue={project.status}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
          </div>

          <PolicyFields p={project} />

          <div className="flex items-center justify-between gap-3">
            <DeleteProjectButton id={project.id} name={project.name} />
            <SubmitButton pendingLabel="Saving…">Save Changes</SubmitButton>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          {/* Categories */}
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold">Plot Categories ({categories.length})</h2>
            {categories.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Badge key={c.id} tone="purple">{c.name}</Badge>
                ))}
              </div>
            )}
            <form action={createPlotCategory} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="project_id" value={project.id} />
              <div className="flex-1" style={{ minWidth: 160 }}>
                <label className="label">New category name</label>
                <input name="name" className="input" placeholder="e.g. Phase 1, Premium, Corner" required />
              </div>
              <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add Category</SubmitButton>
            </form>
          </div>

          {/* Add plot */}
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold">Add Plot</h2>
            <form action={createPlot} className="grid gap-3 sm:grid-cols-5">
              <input type="hidden" name="project_id" value={project.id} />
              <div className="sm:col-span-2">
                <label className="label">Plot Category</label>
                <select name="plot_category_id" className="select" defaultValue="">
                  <option value="">— Uncategorised —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Plot No *</label>
                <input name="plot_no" className="input" required />
              </div>
              <div>
                <label className="label">Sq.ft *</label>
                <input name="sqft" type="number" min={1} step="0.01" className="input" required />
              </div>
              <div>
                <label className="label">₹ / Sq.ft</label>
                <input name="price_per_sqft" type="number" min={0} step="0.01" className="input" defaultValue={0} />
              </div>
              <div className="flex items-end">
                <SubmitButton className="btn-primary w-full" pendingLabel="Adding…">Add</SubmitButton>
              </div>
              <div className="sm:col-span-5">
                <input name="description" className="input" placeholder="Description (optional)" />
              </div>
            </form>
          </div>

          {/* Plot search (left-aligned) */}
          {plots.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="input"
                style={{ maxWidth: 320, flex: "1 1 220px" }}
                placeholder="Search plots (plot no / description)…"
                value={plotSearch}
                onChange={(e) => setPlotSearch(e.target.value)}
              />
              <span className="text-xs text-[var(--muted)]">{visiblePlots.length} shown</span>
            </div>
          )}

          {/* Editable plot cards */}
          {plots.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No plots yet. Add one above.</p>
          ) : visiblePlots.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No plots match your search.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {visiblePlots.map((pl) => (
                <div key={pl.id} className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Plot {pl.plot_no}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">{inr(pl.sqft * pl.price_per_sqft)}</span>
                      <PlotStatusBadge status={pl.status} />
                    </div>
                  </div>
                  <form action={updatePlot} className="grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={pl.id} />
                    <input type="hidden" name="project_id" value={project.id} />
                    <div>
                      <label className="label">Plot No *</label>
                      <input name="plot_no" className="input" required defaultValue={pl.plot_no} />
                    </div>
                    <div>
                      <label className="label">Category</label>
                      <select name="plot_category_id" className="select" defaultValue={pl.plot_category_id ?? ""}>
                        <option value="">— Uncategorised —</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Sq.ft *</label>
                      <input name="sqft" type="number" min={1} step="0.01" className="input" required defaultValue={pl.sqft} />
                    </div>
                    <div>
                      <label className="label">₹ / Sq.ft</label>
                      <input name="price_per_sqft" type="number" min={0} step="0.01" className="input" defaultValue={pl.price_per_sqft} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Description</label>
                      <input name="description" className="input" defaultValue={pl.description ?? ""} placeholder="Optional" />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton className="btn-primary" pendingLabel="Saving…">Save</SubmitButton>
                    </div>
                  </form>
                  <form action={deletePlot}>
                    <input type="hidden" name="id" value={pl.id} />
                    <input type="hidden" name="project_id" value={project.id} />
                    <SubmitButton className="btn-ghost text-[var(--brand-red)]" style={{ padding: "5px 12px", fontSize: 12 }} pendingLabel="Deleting…">
                      Delete plot
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
