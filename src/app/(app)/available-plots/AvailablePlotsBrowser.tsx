"use client";

import { useState } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import InventoryProjectGrid, { type GridProject } from "../inventory/InventoryProjectGrid";
import type { FlowProject } from "../bookings/StartBookingFlow";

// Sales inventory browse: projects with AVAILABLE plots as cards (home district
// first) → open one to see its available plots → open a plot to block it.
export default function AvailablePlotsBrowser({
  projects,
  myDistrict,
}: {
  projects: FlowProject[];
  myDistrict: string | null;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.find((p) => p.id === projectId) ?? null;

  if (!project) {
    const grid: GridProject[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      district: p.district,
      status: "active",
      plots: p.plots.length,
    }));
    return (
      <InventoryProjectGrid
        projects={grid}
        onSelect={setProjectId}
        title="Select a Project"
        priorityDistrict={myDistrict ?? undefined}
        emptyHint="No projects with available plots right now."
      />
    );
  }

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
            {project.city} · {project.plots.length} available plot{project.plots.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {project.plots.map((pl) => (
          <Link
            key={pl.id}
            href={`/plots/${pl.id}`}
            className="card block transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
          >
            <div className="font-medium">{pl.plot_no}</div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              {pl.sqft} sq.ft · {inr(pl.sqft * pl.price_per_sqft)}
            </div>
            <div className="mt-3 text-xs font-medium text-[var(--accent)]">View / Block →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
