import { requireDevUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ImportCard from "./ImportCard";
import { importProjects, importPlots } from "./actions";

export const dynamic = "force-dynamic";

// Dev-only bulk import from Excel. Upload a filled template; each row is parsed
// to JSON, validated, and inserted. Projects and plots have separate templates.
export default async function ImportPage() {
  await requireDevUser(); // hidden dev account only

  return (
    <>
      <PageHeader
        title="Import from Excel"
        subtitle="Bulk-add projects and plots. Download a template, fill it in, then upload the .xlsx (or .csv)."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ImportCard
          title="Projects"
          templateType="project"
          description="One row per project. Required: name, district, city, area, approval_type, project_type. Existing names are skipped."
          action={importProjects}
        />
        <ImportCard
          title="Plots"
          templateType="plot"
          description="One row per plot. The project must already exist (matched by name). Blocks are created automatically. Required: project, plot_no, sqft."
          action={importPlots}
        />
      </div>
    </>
  );
}
