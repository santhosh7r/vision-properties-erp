import ExcelJS from "exceljs";
import { PROJECT_COLUMNS, PLOT_COLUMNS, type ImportColumn } from "./import-spec";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = HEADER_FILL; });
}

// Build the downloadable template: an EMPTY Template sheet to type into, a
// Dropdown Values sheet listing each dropdown field's exact accepted values,
// and an Instructions sheet describing every column.
//
// No sample data ships anywhere in this workbook. The importer reads the first
// sheet only, so example rows there would be imported as real records by anyone
// who filled the sheet in without deleting them first — and a separate sample
// sheet is just as easy to fill in and upload by mistake. The Dropdown Values
// and Instructions sheets carry the same guidance without any row that could
// ever be mistaken for data.
export function buildTemplateWorkbook(type: "project" | "plot"): ExcelJS.Workbook {
  const cols: ImportColumn[] = type === "plot" ? PLOT_COLUMNS : PROJECT_COLUMNS;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Properties ERP";

  // ── Sheet 1: Template — headers only. This is the sheet that gets read. ────
  const ws = wb.addWorksheet("Template");
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 6) }));
  styleHeader(ws.getRow(1));

  // ── Sheet 2: Dropdown Values — exact value to type for every option ────────
  const dv = wb.addWorksheet("Dropdown Values");
  dv.columns = [
    { header: "Field (column)", key: "field", width: 22 },
    { header: "Type exactly", key: "value", width: 20 },
    { header: "Means (form label)", key: "label", width: 28 },
  ];
  for (const c of cols) {
    if (!c.options) continue;
    c.options.forEach((o, idx) => dv.addRow({ field: idx === 0 ? c.header : "", value: o.value, label: o.label }));
    dv.addRow({}); // blank separator between fields
  }
  styleHeader(dv.getRow(1));

  // ── Sheet 3: Instructions — every column, required flag, notes ─────────────
  // "Example value" documents the shape each cell should take. It reads as one
  // value per column on a reference sheet, never as a fillable row of data.
  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Column", key: "col", width: 30 },
    { header: "Required", key: "req", width: 10 },
    { header: "Type", key: "type", width: 12 },
    { header: "Example value", key: "eg", width: 18 },
    { header: "Notes / valid values", key: "note", width: 74 },
  ];
  for (const c of cols) {
    info.addRow({
      col: c.header,
      req: c.required ? "Yes" : "No",
      type: c.options ? "Dropdown" : "Text",
      eg: c.example,
      note: c.note,
    });
  }
  styleHeader(info.getRow(1));

  return wb;
}
