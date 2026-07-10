import ExcelJS from "exceljs";
import { PROJECT_COLUMNS, PLOT_COLUMNS, type ImportColumn } from "./import-spec";

// Fields that must be unique per row — suffixed across example rows so the
// sample sheet can be imported as-is without rows colliding / being skipped.
const UNIQUE_KEYS = new Set(["name", "plot_no"]);

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = HEADER_FILL; });
}

// Build one workbook for a template: a Template sheet with a worked example row
// for EVERY dropdown option, a Dropdown Values sheet listing each dropdown
// field's exact accepted values, and an Instructions sheet.
export function buildTemplateWorkbook(type: "project" | "plot"): ExcelJS.Workbook {
  const cols: ImportColumn[] = type === "plot" ? PLOT_COLUMNS : PROJECT_COLUMNS;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Properties ERP";

  // ── Sheet 1: Template — one example row per dropdown option ────────────────
  const ws = wb.addWorksheet("Template");
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(16, c.header.length + 6) }));
  const rowCount = Math.max(1, ...cols.map((c) => c.options?.length ?? 1));
  for (let i = 0; i < rowCount; i++) {
    const rec: Record<string, string | number> = {};
    for (const c of cols) {
      if (c.options && c.options.length) {
        rec[c.key] = c.options[i % c.options.length].value; // cycle → covers every option
      } else if (UNIQUE_KEYS.has(c.key) && i > 0) {
        rec[c.key] = `${c.example}-${i + 1}`; // keep example rows unique
      } else {
        rec[c.key] = c.example;
      }
    }
    ws.addRow(rec);
  }
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
  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Column", key: "col", width: 30 },
    { header: "Required", key: "req", width: 10 },
    { header: "Type", key: "type", width: 12 },
    { header: "Notes / valid values", key: "note", width: 74 },
  ];
  for (const c of cols) {
    info.addRow({ col: c.header, req: c.required ? "Yes" : "No", type: c.options ? "Dropdown" : "Text", note: c.note });
  }
  styleHeader(info.getRow(1));

  return wb;
}
