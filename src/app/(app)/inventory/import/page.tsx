import { requireCapability } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ImportCard from "./ImportCard";
import { importProjects, importPlots } from "./actions";

export const dynamic = "force-dynamic";

// Bulk import from Excel (Admin). Download a template, fill it in, drop it in.
// Checking and importing are separate steps: nothing is written until the file
// has been read and every row validated, and a file with any problem is refused
// whole and reported row by row, so a sheet can never land half-imported. Only
// the first sheet of a workbook is read. Re-uploading an already-imported file
// cannot duplicate data.
export default async function ImportPage() {
  await requireCapability("manage_projects");

  return (
    <>
      <PageHeader
        title="Import from Excel"
        subtitle="Download a template, fill it in, then drag it in and press Check. Nothing is saved until the file passes — if anything is wrong the whole file is refused and each problem is listed for you to correct. Only the first sheet of a workbook is read."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ImportCard
          title="Projects"
          templateType="project"
          description="One row per project. Required: name, district, city, area, approval_type, project_type. Names must be unique — a project that already exists is reported, not re-created."
          action={importProjects}
        />
        <ImportCard
          title="Plots"
          templateType="plot"
          description="One row per plot. The project must already exist (matched by name); blocks are created automatically. Required: project, plot_no, sqft. A plot number already used in that project is reported, not re-created."
          action={importPlots}
        />
      </div>
    </>
  );
}
