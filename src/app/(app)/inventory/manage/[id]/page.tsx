import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope, projectInScope } from "@/lib/scope";
import { PageHeader, Badge } from "@/components/ui";
import type { Plot, PlotCategory, Project } from "@/lib/types";
import ManageProjectClient, { type EditCategory, type EditPlot } from "./ManageProjectClient";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  has_dependents:
    "This project can’t be deleted because it has bookings or registrations linked to it. Close those first.",
  delete_failed: "Could not delete the project. Please try again.",
  plot_has_dependents:
    "That plot can’t be deleted because it has bookings or registrations. Cancel/release them first.",
};

const STATUS_TONE: Record<string, "green" | "gray" | "amber" | "red"> = {
  active: "green",
  draft: "gray",
  on_hold: "amber",
  closed: "red",
};

export default async function ManageProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorKey } = await searchParams;
  const user = await requireCapability("manage_projects");
  const sb = getSupabase();

  // The grid already hides other branches' projects; this stops one being opened
  // by typing its URL. Unscoped roles pass through.
  const scope = await getDistrictScope(sb, user);
  if (!projectInScope(scope, id)) notFound();

  const { data: projectData } = await sb.from("projects").select("*").eq("id", id).maybeSingle();
  if (!projectData) notFound();
  const project = projectData as Project;

  const [{ data: catData }, { data: plotData }] = await Promise.all([
    sb.from("plot_categories").select("id, name").eq("project_id", id).order("name"),
    sb.from("plots").select("id, plot_no, sqft, price_per_sqft, plot_category_id, description, status").eq("project_id", id).order("plot_no"),
  ]);
  const categories = (catData ?? []) as EditCategory[];
  const plots = ((plotData ?? []) as Pick<Plot, "id" | "plot_no" | "sqft" | "price_per_sqft" | "plot_category_id" | "description" | "status">[]).map(
    (p): EditPlot => ({
      id: p.id,
      plot_no: p.plot_no,
      sqft: p.sqft,
      price_per_sqft: p.price_per_sqft,
      plot_category_id: p.plot_category_id,
      description: p.description,
      status: p.status,
    }),
  );

  const errorMsg = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <>
      <PageHeader
        title={`Edit · ${project.name}`}
        subtitle={`${project.city} · ${project.district} · ${project.area}`}
        back={{ href: "/inventory/manage", label: "← All Projects" }}
        action={
          <Badge tone={STATUS_TONE[project.status] ?? "gray"}>{project.status.replace(/_/g, " ")}</Badge>
        }
      />

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      <ManageProjectClient project={project} categories={categories} plots={plots} />
    </>
  );
}
