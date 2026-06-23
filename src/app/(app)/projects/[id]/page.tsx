import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { APPROVAL_TYPES, PROJECT_TYPES } from "@/lib/options";
import { inr } from "@/lib/format";
import { PageHeader, Badge, PlotStatusBadge, EmptyState } from "@/components/ui";
import type { Plot, PlotCategory, Project } from "@/lib/types";
import { updateProjectStatus } from "../actions";
import { createPlot, createPlotCategory, updatePlotCategory } from "../../plots/actions";
import DeleteProjectButton from "./DeleteProjectButton";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const DELETE_ERRORS: Record<string, string> = {
  has_dependents:
    "This project can’t be deleted because it has bookings or registrations linked to it. Close them first, or set the project to “Closed”.",
  delete_failed: "Could not delete the project. Please try again.",
};

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorKey } = await searchParams;
  const deleteError = errorKey ? DELETE_ERRORS[errorKey] : undefined;
  const user = await requireUser();
  const sb = getSupabase();

  const { data: project } = await sb
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const p = project as Project;

  const { data: catData } = await sb
    .from("plot_categories")
    .select("*")
    .eq("project_id", id)
    .order("name");
  const groups = (catData ?? []) as PlotCategory[];

  // Sales users (no manage_plots) only ever see available plots.
  const canAddPlots = can(user.role, "manage_plots");
  let plotQuery = sb
    .from("plots")
    .select("*")
    .eq("project_id", id)
    .order("plot_no");
  if (!canAddPlots) plotQuery = plotQuery.eq("status", "available");
  const { data: plotData } = await plotQuery;
  const plots = (plotData ?? []) as Plot[];

  // Bucket plots by category for the grouped display (uncategorised last).
  const buckets: { id: string | null; name: string; items: Plot[] }[] = [
    ...groups.map((g) => ({
      id: g.id,
      name: g.name,
      items: plots.filter((pl) => pl.plot_category_id === g.id),
    })),
    { id: null, name: "Uncategorised", items: plots.filter((pl) => !pl.plot_category_id) },
  ].filter((b) => b.items.length > 0);

  const editable = can(user.role, "manage_projects");

  const approval = APPROVAL_TYPES.find((a) => a.value === p.approval_type)?.label;
  const ptype = PROJECT_TYPES.find((a) => a.value === p.project_type)?.label;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={`${p.city} · ${p.district} · ${p.area}`}
        action={
          <>
            <Link href="/projects" className="btn-ghost">
              ← All Projects
            </Link>
            {editable && (
              <>
                <Link href={`/projects/${p.id}/edit`} className="btn-primary">
                  Edit
                </Link>
                <DeleteProjectButton id={p.id} name={p.name} />
              </>
            )}
          </>
        }
      />

      {deleteError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {deleteError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project info */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Details</span>
              <Badge tone={p.status === "active" ? "green" : "amber"}>{p.status}</Badge>
            </div>
            <Field label="Approval">{approval}</Field>
            <Field label="Project Type">{ptype}</Field>
            <Field label="Land Type">{p.land_type}</Field>
            {p.remarks && <Field label="Remarks">{p.remarks}</Field>}
          </div>

          <div className="card space-y-3">
            <span className="text-sm font-semibold">Booking Rules</span>
            <Field label="Blocking Amount">{inr(p.blocking_amount)}</Field>
            <Field label="Block Window">{p.blocking_window_hours} hours</Field>
            <Field label="Advance">{p.advance_percent}% of plot value</Field>
            <Field label="Booking Window">{p.booking_window_days} days</Field>
          </div>

          {editable && (
            <form action={updateProjectStatus} className="card flex items-end gap-2">
              <input type="hidden" name="id" value={p.id} />
              <div className="flex-1">
                <label className="label">Change Status</label>
                <select name="status" className="select" defaultValue={p.status}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <SubmitButton className="btn-ghost" pendingLabel="Saving…">Save</SubmitButton>
            </form>
          )}
        </div>

        {/* Plots */}
        <div className="space-y-4 lg:col-span-2">
          {canAddPlots && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold">Plot Categories ({groups.length})</h2>
              {groups.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <Badge key={g.id} tone="purple">{g.name}</Badge>
                  ))}
                </div>
              )}
              <form action={createPlotCategory} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="project_id" value={p.id} />
                <div className="flex-1" style={{ minWidth: 160 }}>
                  <label className="label">New category name</label>
                  <input name="name" className="input" placeholder="e.g. Phase 1, Premium, Corner" required />
                </div>
                <SubmitButton className="btn-ghost" pendingLabel="Adding…">Add Category</SubmitButton>
              </form>
            </div>
          )}

          {canAddPlots && (
            <div className="card">
              <h2 className="mb-3 text-sm font-semibold">Add Plot</h2>
              <form action={createPlot} className="grid gap-3 sm:grid-cols-5">
                <input type="hidden" name="project_id" value={p.id} />
                <div className="sm:col-span-2">
                  <label className="label">Plot Category</label>
                  <select name="plot_category_id" className="select" defaultValue="">
                    <option value="">— Uncategorised —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
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
          )}

          {plots.length === 0 ? (
            <div className="card">
              <EmptyState message="No plots yet for this project." />
            </div>
          ) : (
            buckets.map((bucket) => (
              <div key={bucket.id ?? "none"} className="card p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="text-sm font-semibold">
                    {bucket.name} <span className="text-[var(--muted)]">({bucket.items.length})</span>
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="th">Plot No</th>
                        <th className="th">Sq.ft</th>
                        <th className="th">₹/Sq.ft</th>
                        <th className="th">Plot Value</th>
                        <th className="th">Status</th>
                        {canAddPlots && <th className="th">Category</th>}
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.items.map((pl) => (
                        <tr key={pl.id} className="border-b last:border-0">
                          <td className="td font-medium">{pl.plot_no}</td>
                          <td className="td">{pl.sqft}</td>
                          <td className="td">{inr(pl.price_per_sqft)}</td>
                          <td className="td">{inr(pl.sqft * pl.price_per_sqft)}</td>
                          <td className="td"><PlotStatusBadge status={pl.status} /></td>
                          {canAddPlots && (
                            <td className="td">
                              <form action={updatePlotCategory} className="flex items-center gap-1">
                                <input type="hidden" name="id" value={pl.id} />
                                <input type="hidden" name="project_id" value={p.id} />
                                <select
                                  name="plot_category_id"
                                  className="select"
                                  defaultValue={pl.plot_category_id ?? ""}
                                  style={{ padding: "4px 8px", fontSize: 12, minWidth: 120 }}
                                >
                                  <option value="">— Uncategorised —</option>
                                  {groups.map((g) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                                <SubmitButton className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} pendingLabel="…">
                                  Move
                                </SubmitButton>
                              </form>
                            </td>
                          )}
                          <td className="td">
                            <Link href={`/plots/${pl.id}`} className="text-xs text-[var(--accent)] hover:underline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}
