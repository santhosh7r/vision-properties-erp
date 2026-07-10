import { requireDevUser } from "@/lib/auth";
import { buildTemplateWorkbook } from "@/lib/import-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dev-only downloadable Excel templates for bulk import.
//   /inventory/import/template?type=project
//   /inventory/import/template?type=plot
export async function GET(req: Request): Promise<Response> {
  await requireDevUser(); // hidden dev account only

  const type = new URL(req.url).searchParams.get("type") === "plot" ? "plot" : "project";
  const wb = buildTemplateWorkbook(type);
  const buf = await wb.xlsx.writeBuffer();
  const filename = type === "plot" ? "plot-import-template.xlsx" : "project-import-template.xlsx";

  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
