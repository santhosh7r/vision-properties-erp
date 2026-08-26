import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope } from "@/lib/scope";
import { PageHeader, EmptyState } from "@/components/ui";
import type { Project } from "@/lib/types";
import InventoryProjectGrid, { type GridProject } from "../InventoryProjectGrid";

export const dynamic = "force-dynamic";

// Admin Inventory · Manage / Edit Plots & Projects. Card grid of every project;
// each card opens the project hub where its details can be edited and its plots
// added, moved, re-priced or released. Admin, and the branch GM for their own
// district's projects.
export default async function ManageInventoryPage() {
  const user = await requireCapability("manage_projects");
  const sb = getSupabase();

  // A branch account (General Manager) manages its OWN district's inventory.
  // Unscoped roles get null back and keep the company-wide grid.
  const scope = await getDistrictScope(sb, user);
  let q = sb.from("projects").select("*, plots(count)").order("name");
  if (scope) q = q.in("id", scope.projectIds);
  const { data } = await q;

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
          hrefBase="/inventory/manage"
          title="All Projects"
          variant="list"
        />
      )}
    </>
  );
}
