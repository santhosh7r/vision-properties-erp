import "server-only";
import ExcelJS from "exceljs";
import { DEPARTMENTS } from "./catalog";
import type { ReportColumn, ReportResult, Cell } from "./data";
import { IST_OFFSET_MS, type ReportPeriod } from "./period";

// ---------------------------------------------------------------------------
// The downloaded workbook.
//   1. Summary — month, scope, who generated it and when, one line per report
//      (records + headline figures + the rule for what is counted), and notes.
//   2. One sheet per report — a plain table: header on row 1, frozen, with an
//      auto-filter, so it sorts, filters and pivots without clean-up. Totals
//      live on the Summary, never under the data, where they would break that.
// Dates are real Excel dates (IST wall-clock), money is a number, never text.
// ---------------------------------------------------------------------------

export interface WorkbookMeta {
  period: ReportPeriod;
  scopeLabel: string;
  generatedBy: string;
  generatedAt: Date;
  notes: string[];
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
const FMT: Record<string, string> = {
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
  money: "#,##0.00",
  number: "#,##0.##",
};
const DEFAULT_WIDTH: Record<string, number> = { date: 13, datetime: 18, money: 15, number: 11, text: 16 };

const deptLabel = (k: string) => DEPARTMENTS.find((d) => d.key === k)?.label ?? k;

// Excel sheet names: ≤ 31 chars, none of : \ / ? * [ ], unique in the book.
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

function toCell(value: Cell, col: ReportColumn): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  switch (col.type) {
    case "date": {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : String(value);
    }
    case "datetime": {
      // ExcelJS writes a Date as UTC; shifting by +5:30 makes the cell show the
      // IST wall-clock time the business actually saw.
      const t = new Date(String(value)).getTime();
      return Number.isNaN(t) ? String(value) : new Date(t + IST_OFFSET_MS);
    }
    case "money":
    case "number":
      return typeof value === "number" ? value : Number(value) || 0;
    default:
      return String(value);
  }
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle" };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
  });
}

function addReportSheet(wb: ExcelJS.Workbook, r: ReportResult, period: ReportPeriod, name: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = r.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(c.width ?? DEFAULT_WIDTH[c.type ?? "text"], Math.min(c.header.length + 2, 30)),
    style: c.type && FMT[c.type] ? { numFmt: FMT[c.type] } : {},
  }));
  styleHeader(ws.getRow(1));

  if (r.rows.length === 0) {
    const row = ws.addRow([`No records for ${period.label}.`]);
    row.font = { italic: true, color: { argb: "FF6B7280" } };
    return;
  }
  for (const row of r.rows) {
    ws.addRow(Object.fromEntries(r.columns.map((c) => [c.key, toCell(row[c.key], c)])));
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: r.columns.length } };
}

export function buildReportWorkbook(results: ReportResult[], meta: WorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vision Properties ERP";
  wb.created = meta.generatedAt;

  const used = new Set<string>(["summary"]);
  const names = results.map((r) => sheetName(r.def.title, used));

  // ── Summary ────────────────────────────────────────────────────────────────
  const s = wb.addWorksheet("Summary");
  s.columns = [
    { key: "a", width: 20 },
    { key: "b", width: 32 },
    { key: "c", width: 10 },
    { key: "d", width: 70 },
    { key: "e", width: 60 },
  ];
  const title = s.addRow(["Vision Properties — Monthly Report"]);
  title.font = { bold: true, size: 14 };
  const generated = new Date(meta.generatedAt.getTime() + IST_OFFSET_MS);
  const when = generated.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  });
  for (const [k, v] of [
    ["Month", meta.period.label],
    ["Scope", meta.scopeLabel],
    ["Generated", `${when} IST · ${meta.generatedBy}`],
  ]) {
    const row = s.addRow([k, v]);
    row.getCell(1).font = { bold: true };
  }
  s.addRow([]);
  styleHeader(s.addRow(["Department", "Report", "Records", "Highlights", "Counted by"]));
  results.forEach((r, i) => {
    const row = s.addRow([deptLabel(r.def.department), r.def.title, r.rows.length, r.highlights.join("\n"), r.def.countedBy]);
    row.alignment = { vertical: "top", wrapText: true };
    // Link each line to its sheet.
    row.getCell(2).value = { text: r.def.title, hyperlink: `#'${names[i]}'!A1` };
    row.getCell(2).font = { color: { argb: "FF1D4ED8" }, underline: true };
  });
  if (meta.notes.length) {
    s.addRow([]);
    s.addRow(["Notes"]).font = { bold: true };
    for (const note of meta.notes) {
      const row = s.addRow(["", note]);
      s.mergeCells(row.number, 2, row.number, 5);
      row.alignment = { wrapText: true, vertical: "top" };
    }
  }

  results.forEach((r, i) => addReportSheet(wb, r, meta.period, names[i]));
  return wb;
}
