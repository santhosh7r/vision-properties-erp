import ExcelJS from "exceljs";
import { requireCapability } from "@/lib/auth";
import { PROJECT_COLUMNS, PLOT_COLUMNS, type ImportColumn } from "@/lib/import-spec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only downloadable Excel templates for bulk import.
//   /inventory/import/template?type=project
//   /inventory/import/template?type=plot
export async function GET(req: Request): Promise<Response> {
  await requireCapability("manage_projects"); // admin only

  const type = new URL(req.url).searchParams.get("type") === "plot" ? "plot" : "project";
  const cols: ImportColumn[] = type === "plot" ? PLOT_COLUMNS : PROJECT_COLUMNS;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Properties ERP";

  // Sheet 1 — the fill-in template with a single example row.
  const ws = wb.addWorksheet("Template");
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 6) }));
  ws.addRow(Object.fromEntries(cols.map((c) => [c.key, c.example])));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
  });

  // Sheet 2 — instructions / valid values.
  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Column", key: "col", width: 26 },
    { header: "Required", key: "req", width: 10 },
    { header: "Notes / valid values", key: "note", width: 70 },
  ];
  cols.forEach((c) => info.addRow({ col: c.header, req: c.required ? "Yes" : "No", note: c.note }));
  info.getRow(1).font = { bold: true };

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
