import ExcelJS from "exceljs";
import {
  PROJECT_COLUMNS,
  PLOT_COLUMNS,
  PROJECT_EXAMPLE_ROWS,
  PLOT_EXAMPLE_ROWS,
  type ImportColumn,
} from "./import-spec";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = HEADER_FILL; });
}

// Build the downloadable template:
//   1. Template                  — EMPTY, headers only. This is the sheet read on upload.
//   2. Example (how to fill)     — worked rows showing the shape of every column.
//   3. Dropdown Values           — the exact text to type for each dropdown field.
//   4. Instructions              — every column, required flag and notes.
//
// The Template sheet stays empty ON PURPOSE. The importer reads the FIRST sheet
// only, so a sample row left there would be imported as a real project or plot
// by anyone who filled the file in without deleting it first. Putting the
// worked rows on sheet 2 gives whoever fills the file something concrete to copy
// while keeping the uploaded sheet clean — sheet 2 is never read.
export function buildTemplateWorkbook(type: "project" | "plot"): ExcelJS.Workbook {
  const cols: ImportColumn[] = type === "plot" ? PLOT_COLUMNS : PROJECT_COLUMNS;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Properties ERP";

  // ── Sheet 1: Template — headers only. This is the sheet that gets read. ────
  const ws = wb.addWorksheet("Template");
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 6) }));
  styleHeader(ws.getRow(1));

  // ── Sheet 2: Example — worked rows. NEVER read by the importer. ───────────
  const ex = wb.addWorksheet("Example (how to fill)");
  ex.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 6) }));
  styleHeader(ex.getRow(1));
  for (const row of type === "plot" ? PLOT_EXAMPLE_ROWS : PROJECT_EXAMPLE_ROWS) ex.addRow(row);
  // Spell out that this sheet is a reference, immediately under the data, so it
  // cannot be mistaken for the sheet to fill in.
  ex.addRow({});
  const note = ex.addRow({ [cols[0].key]: "↑ EXAMPLE ONLY — do not upload this sheet. Type your own rows on the \"Template\" sheet." });
  note.font = { italic: true, color: { argb: "FFB00020" } };

  // ── Sheet 3: Dropdown Values — exact value to type for every option ────────
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

  // ── Sheet 4: Instructions — every column, required flag, notes ─────────────
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
