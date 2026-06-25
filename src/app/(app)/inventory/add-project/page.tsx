import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictNames } from "@/lib/districts";
import { APPROVAL_TYPES, PROJECT_TYPES } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import PolicyFields from "../../projects/PolicyFields";
import { createProject } from "../../projects/actions";
import LocationFields from "./LocationFields";

export const dynamic = "force-dynamic";

// Admin Inventory · Add Project. Same form as the shared New Project page, but
// scoped to the admin card-based Inventory workspace.
export default async function AddProjectPage() {
  await requireCapability("manage_projects");
  const sb = getSupabase();

  // District options come from the admin-managed master list. City stays an
  // editable list of values already used across projects.
  const districtOptions = await getDistrictNames(sb);
  const { data: locRows } = await sb.from("projects").select("city");
  const cityOptions = [
    ...new Set(((locRows ?? []) as { city: string | null }[]).map((r) => (r.city ?? "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Add Project"
        subtitle="Set up a new development and configure its booking rules."
        back={{ href: "/inventory/manage", label: "← Manage/Edit Plots" }}
      />

      <form action={createProject} className="max-w-3xl space-y-6">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Project Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input name="name" className="input" required />
            </div>
            <LocationFields districtOptions={districtOptions} cityOptions={cityOptions} />
            <div>
              <label className="label">Extent *</label>
              <input name="area" className="input" placeholder="e.g. 12 acres" required />
            </div>
            <div>
              <label className="label">Approval *</label>
              <select name="approval_type" className="select" required defaultValue="">
                <option value="" disabled>Select approval</option>
                {APPROVAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select name="project_type" className="select" required defaultValue="">
                <option value="" disabled>Select type</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <PolicyFields />
        <input type="hidden" name="status" value="active" />

        <div className="flex justify-end gap-3">
          <Link href="/inventory/manage" className="btn-ghost">Cancel</Link>
          <SubmitButton pendingLabel="Creating…">Create Project</SubmitButton>
        </div>
      </form>
    </>
  );
}
