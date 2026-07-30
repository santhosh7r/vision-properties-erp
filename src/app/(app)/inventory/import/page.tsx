import { requireDevUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ImportCard from "./ImportCard";
import { importProjects, importPlots } from "./actions";

export const dynamic = "force-dynamic";

// Dev-only bulk import from Excel. Download a template, fill it in, upload it,
// and the file is CHECKED before anything is written — a file with any problem
// is reported row by row and saved nowhere. Only a fully clean file can be
// committed, so re-uploading an already-imported file cannot duplicate data.
export default async function ImportPage() {
  await requireDevUser(); // hidden dev account only

  return (
    <>
      <PageHeader
        title="Import from Excel"
        subtitle="Download a template, fill it in, then check the file. Nothing is saved until the check passes with no problems."
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
