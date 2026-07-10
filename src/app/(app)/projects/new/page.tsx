import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { APPROVAL_TYPES, DISTRICTS, PROJECT_TYPES } from "@/lib/options";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import PolicyFields from "../PolicyFields";
import { createProject } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requireCapability("manage_projects");

  return (
    <>
      <PageHeader
        title="New Project"
        subtitle="Set up a new development and configure its booking rules."
        back={{ href: "/projects", label: "← Back" }}
      />

      <form action={createProject} className="max-w-3xl space-y-6">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Project Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">District *</label>
              <select name="district" className="select" required defaultValue="">
                <option value="" disabled>— Select district —</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">City *</label>
              <input name="city" className="input" required />
            </div>
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
          <Link href="/projects" className="btn-ghost">Cancel</Link>
          <SubmitButton pendingLabel="Creating…">Create Project</SubmitButton>
        </div>
      </form>
    </>
  );
}
