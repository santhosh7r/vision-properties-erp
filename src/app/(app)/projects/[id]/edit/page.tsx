import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { APPROVAL_TYPES, PROJECT_TYPES } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import PolicyFields from "../../PolicyFields";
import type { Project } from "@/lib/types";
import { updateProject } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCapability("manage_projects");
  const sb = getSupabase();

  const { data: project } = await sb.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;

  return (
    <>
      <PageHeader
        title="Edit Project"
        subtitle={p.name}
        action={<Link href={`/projects/${p.id}`} className="btn-ghost">Cancel</Link>}
      />

      <form action={updateProject} className="max-w-3xl space-y-6">
        <input type="hidden" name="id" value={p.id} />
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Project Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input name="name" className="input" required defaultValue={p.name} />
            </div>
            <div>
              <label className="label">District *</label>
              <input name="district" className="input" required defaultValue={p.district} />
            </div>
            <div>
              <label className="label">City *</label>
              <input name="city" className="input" required defaultValue={p.city} />
            </div>
            <div>
              <label className="label">Extent *</label>
              <input name="area" className="input" placeholder="e.g. 12 acres" required defaultValue={p.area} />
            </div>
            <div>
              <label className="label">Approval *</label>
              <select name="approval_type" className="select" required defaultValue={p.approval_type}>
                <option value="" disabled>Select approval</option>
                {APPROVAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select name="project_type" className="select" required defaultValue={p.project_type}>
                <option value="" disabled>Select type</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" className="select" defaultValue={p.status}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        <PolicyFields p={p} />

        <div className="flex justify-end gap-3">
          <Link href={`/projects/${p.id}`} className="btn-ghost">Cancel</Link>
          <SubmitButton pendingLabel="Saving…">Save Changes</SubmitButton>
        </div>
      </form>
    </>
  );
}
