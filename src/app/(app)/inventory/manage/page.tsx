import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/ui";
import { Plus } from "@/components/icons";
import type { Project } from "@/lib/types";
import InventoryProjectGrid, { type GridProject } from "../InventoryProjectGrid";

export const dynamic = "force-dynamic";

// Admin Inventory · Manage / Edit Plots & Projects. Card grid of every project;
// each card opens the project hub where its details can be edited and its plots
// added, moved, re-priced or released. Admin-only.
export default async function ManageInventoryPage() {
  await requireCapability("manage_projects");
  const sb = getSupabase();

  const { data } = await sb
    .from("projects")
    .select("*, plots(count)")
    .order("name");

  const raw = (data ?? []) as (Project & { plots: { count: number }[] })[];
  const projects: GridProject[] = raw.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    district: p.district,
    status: p.status,
    plots: p.plots?.[0]?.count ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Manage/Edit Plots"
        subtitle="Open any project to edit its details and manage its plots."
        action={
          <Link href="/inventory/add-project" className="btn-primary">
            <Plus size={16} /> Add Project
          </Link>
        }
      />
      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            message="No projects yet."
            hint="Create your first project from Add Project."
          />
        </div>
      ) : (
        <InventoryProjectGrid
          projects={projects}
          hrefBase="/projects"
          title="All Projects"
        />
      )}
    </>
  );
}
