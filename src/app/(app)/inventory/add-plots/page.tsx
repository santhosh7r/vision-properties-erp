import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader, EmptyState } from "@/components/ui";
import type { Plot, PlotCategory, Project } from "@/lib/types";
import AddPlotsWorkspace, { type WorkspaceProject } from "./AddPlotsWorkspace";

export const dynamic = "force-dynamic";

// Admin Inventory · Add Plots. Pick a project from the card grid, then add plots
// (and categories) to it. Admin-only.
export default async function AddPlotsPage() {
  await requireCapability("manage_plots");
  const sb = getSupabase();

  const [{ data: projData }, { data: catData }, { data: plotData }] = await Promise.all([
    sb.from("projects").select("*").order("name"),
    sb.from("plot_categories").select("*").order("name"),
    sb.from("plots").select("*").order("plot_no"),
  ]);

  const projects = (projData ?? []) as Project[];
  const cats = (catData ?? []) as PlotCategory[];
  const plots = (plotData ?? []) as Plot[];

  const workspaceProjects: WorkspaceProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    district: p.district,
    status: p.status,
    groups: cats
      .filter((c) => c.project_id === p.id)
      .map((c) => ({ id: c.id, name: c.name })),
    plots: plots
      .filter((pl) => pl.project_id === p.id)
      .map((pl) => ({
        id: pl.id,
        plot_no: pl.plot_no,
        sqft: pl.sqft,
        price_per_sqft: pl.price_per_sqft,
        status: pl.status,
        plot_category_id: pl.plot_category_id,
      })),
  }));

  return (
    <>
      <PageHeader
        title="Add Plots"
        subtitle="Pick a project, then add plots and categories to it."
      />
      {workspaceProjects.length === 0 ? (
        <div className="card">
          <EmptyState
            message="No projects yet."
            hint="Create a project from Add Project before adding plots."
          />
        </div>
      ) : (
        <AddPlotsWorkspace projects={workspaceProjects} />
      )}
    </>
  );
}
