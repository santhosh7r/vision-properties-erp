"use server";

import { Readable } from "stream";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  PROJECT_COLUMNS,
  PLOT_COLUMNS,
  normApprovalType,
  normProjectType,
  normProjectStatus,
  normPlotStatus,
} from "@/lib/import-spec";

// ============================================================================
// Bulk import — STRICT, ALL-OR-NOTHING.
//
// The file is never partially imported. Every upload is analysed first and the
// result is returned as a report; only a file with ZERO problems can be
// committed, and the commit re-runs the exact same analysis server-side before
// writing anything. A file with one bad row saves nothing at all — the user
// fixes the sheet and uploads again.
//
// Re-uploading an already-imported file is therefore safe: every row collides
// with an existing record, the file is reported as duplicate, and nothing is
// written a second time.
// ============================================================================

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 10;

/** One problem found in the sheet, addressed to a specific row + column. */
export interface RowIssue {
  row: number | null; // null = whole-file problem (e.g. a missing column)
  column: string;
  message: string;
}

export interface ImportReport {
  fileName: string;
  fileSize: number;
  totalRows: number;
  issues: RowIssue[];
  previewHeaders: string[];
  previewRows: string[][];
}

export type ImportState =
  | null
  /** File could not even be read / is not the template. Nothing was saved. */
  | { phase: "rejected"; error: string }
  /**
   * The file was read but did not pass validation. NOTHING was saved — the whole
   * upload is refused so a sheet is never half-imported. `report.issues` lists
   * every problem, row by row, for the user to correct and upload again.
   */
  | { phase: "invalid"; report: ImportReport }
  /** Every row passed and was written. */
  | { phase: "imported"; created: number; fileName: string };

// ── Cell helpers ────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return String(o.result ?? "").trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? "").join("").trim();
  }
  return String(v).trim();
}

/**
 * Strict numeric cell. Unlike a silent fallback, a cell that holds something
 * unparseable ("1,2OO") is reported rather than quietly becoming 0 — a typo in
 * a price must never be imported as free.
 */
function numCell(v: unknown, fallback: number): { ok: boolean; value: number } {
  const s = str(v);
  if (s === "") return { ok: true, value: fallback };
  const n = Number(s.replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, value: fallback };
}

type SheetRow = Record<string, unknown> & { __row: number };

/** Parsed sheet: header names actually present + the data rows. */
interface Sheet {
  headers: string[];
  rows: SheetRow[];
}

async function readSheet(file: File): Promise<Sheet> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    await wb.csv.read(Readable.from(buf));
  } else {
    await wb.xlsx.load(buf);
  }
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = str(cell.value).toLowerCase();
  });

  const rows: SheetRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, unknown> = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (h) obj[h] = cell.value;
    });
    if (Object.values(obj).some((v) => str(v) !== "")) rows.push({ __row: rowNum, ...obj });
  });
  return { headers: headers.filter(Boolean), rows };
}

function getFile(formData: FormData): File | null {
  const f = formData.get("file");
  if (f && typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0) return f as File;
  return null;
}

/** Guard the upload before any per-row work. Returns a message, or null if fine. */
function checkShape(sheet: Sheet, required: string[]): string | null {
  if (sheet.rows.length === 0) {
    return "No data rows found. Fill the template in below the header row, then upload again.";
  }
  if (sheet.rows.length > MAX_ROWS) {
    return `Too many rows (${sheet.rows.length}). The limit is ${MAX_ROWS} per upload — split the file.`;
  }
  const missing = required.filter((h) => !sheet.headers.includes(h));
  if (missing.length) {
    return `This file does not match the template — missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template and use it as-is.`;
  }
  return null;
}

// ── Projects: analysis ──────────────────────────────────────────────────────

interface ProjectRecord {
  __row: number;
  name: string;
  district: string;
  city: string;
  pincode: string | null;
  area: string;
  approval_type: string;
  project_type: string;
  status: string;
  branch: string | null;
  [key: string]: unknown;
}

const PROJECT_NUMERIC: Array<[string, number]> = [
  ["guideline_value", 0],
  ["director_gold_coupon", 0],
  ["director_digital_coupon", 0],
  ["senior_director_gold_coupon", 0],
  ["director_tools_coupon", 0],
  ["blocking_amount", 10000],
  ["blocking_window_hours", 48],
  ["advance_percent", 5],
  ["advance_min_amount", 50000],
  ["booking_window_days", 15],
  ["cancel_full_refund_days", 3],
  ["cancellation_charge", 5000],
  ["refund_processing_days", 5],
  ["transfer_charge", 5000],
];

const PROJECT_STATUSES = ["draft", "active", "on_hold", "closed"];

async function analyseProjects(sheet: Sheet): Promise<{ issues: RowIssue[]; records: ProjectRecord[] }> {
  const sb = getSupabase();
  const { data: existing } = await sb.from("projects").select("name");
  const inDb = new Set((existing ?? []).map((p) => str(p.name).toLowerCase()));

  const issues: RowIssue[] = [];
  const records: ProjectRecord[] = [];
  const seenInFile = new Map<string, number>(); // lower name -> first row it appeared on

  for (const r of sheet.rows) {
    const row = r.__row;
    const before = issues.length;

    const name = str(r.name);
    const district = str(r.district);
    const city = str(r.city);
    const area = str(r.area);

    if (!name) issues.push({ row, column: "name", message: "Project name is required" });
    if (!district) issues.push({ row, column: "district", message: "District is required" });
    if (!city) issues.push({ row, column: "city", message: "City is required" });
    if (!area) issues.push({ row, column: "area", message: "Area / extent is required" });

    const approval_type = normApprovalType(r.approval_type);
    if (!approval_type) {
      issues.push({
        row,
        column: "approval_type",
        message: `"${str(r.approval_type) || "(blank)"}" is not valid — use dtcp_rera or dtcp_only`,
      });
    }
    const project_type = normProjectType(r.project_type);
    if (!project_type) {
      issues.push({
        row,
        column: "project_type",
        message: `"${str(r.project_type) || "(blank)"}" is not valid — use affordable or luxury`,
      });
    }

    // A misspelled status must be reported, never silently defaulted to draft.
    const rawStatus = str(r.status).toLowerCase().replace(/\s+/g, "_");
    if (rawStatus && !PROJECT_STATUSES.includes(rawStatus)) {
      issues.push({
        row,
        column: "status",
        message: `"${str(r.status)}" is not valid — use draft, active, on_hold or closed`,
      });
    }

    const numbers: Record<string, number> = {};
    for (const [key, fallback] of PROJECT_NUMERIC) {
      const parsed = numCell(r[key], fallback);
      if (!parsed.ok) {
        issues.push({ row, column: key, message: `"${str(r[key])}" is not a number` });
      } else if (parsed.value < 0) {
        issues.push({ row, column: key, message: "Cannot be negative" });
      } else {
        numbers[key] = parsed.value;
      }
    }

    // Duplicates — inside the file, and against what is already saved.
    if (name) {
      const key = name.toLowerCase();
      const firstSeen = seenInFile.get(key);
      if (firstSeen) {
        issues.push({ row, column: "name", message: `Duplicate of row ${firstSeen} — "${name}" appears twice in this file` });
      } else if (inDb.has(key)) {
        issues.push({ row, column: "name", message: `"${name}" already exists in the system — remove this row or rename it` });
      } else {
        seenInFile.set(key, row);
      }
    }

    if (issues.length === before) {
      records.push({
        __row: row,
        name,
        district,
        city,
        pincode: str(r.pincode) || null,
        area,
        approval_type: approval_type!,
        project_type: project_type!,
        status: normProjectStatus(r.status),
        branch: str(r.branch) || null,
        ...numbers,
      });
    }
  }

  return { issues, records };
}

// ── Plots: analysis ─────────────────────────────────────────────────────────

interface PlotRecord {
  __row: number;
  project_id: string;
  projectName: string;
  block: string;
  plot_no: string;
  sqft: number;
  price_per_sqft: number;
  description: string | null;
  status: string;
}

async function analysePlots(sheet: Sheet): Promise<{ issues: RowIssue[]; records: PlotRecord[] }> {
  const sb = getSupabase();
  const { data: projects } = await sb.from("projects").select("id, name");
  const projByName = new Map((projects ?? []).map((p) => [str(p.name).toLowerCase(), p.id as string]));
  const projIds = (projects ?? []).map((p) => p.id as string);

  const takenPlotNo = new Set<string>(); // `${projectId}::${lowerPlotNo}`
  if (projIds.length) {
    const { data: plots } = await sb.from("plots").select("project_id, plot_no").in("project_id", projIds);
    for (const p of plots ?? []) takenPlotNo.add(`${p.project_id}::${str(p.plot_no).toLowerCase()}`);
  }

  const issues: RowIssue[] = [];
  const records: PlotRecord[] = [];
  const seenInFile = new Map<string, number>();

  for (const r of sheet.rows) {
    const row = r.__row;
    const before = issues.length;

    const projectName = str(r.project);
    const plot_no = str(r.plot_no);

    let project_id: string | undefined;
    if (!projectName) {
      issues.push({ row, column: "project", message: "Project name is required" });
    } else {
      project_id = projByName.get(projectName.toLowerCase());
      if (!project_id) {
        issues.push({
          row,
          column: "project",
          message: `Project "${projectName}" does not exist — create it first, or fix the spelling`,
        });
      }
    }

    if (!plot_no) issues.push({ row, column: "plot_no", message: "Plot number is required" });

    const sqftCell = numCell(r.sqft, 0);
    if (!sqftCell.ok) {
      issues.push({ row, column: "sqft", message: `"${str(r.sqft)}" is not a number` });
    } else if (!(sqftCell.value > 0)) {
      issues.push({ row, column: "sqft", message: "Must be a number greater than 0" });
    }

    const priceCell = numCell(r.price_per_sqft, 0);
    if (!priceCell.ok) {
      issues.push({ row, column: "price_per_sqft", message: `"${str(r.price_per_sqft)}" is not a number` });
    } else if (priceCell.value < 0) {
      issues.push({ row, column: "price_per_sqft", message: "Cannot be negative" });
    }

    const status = normPlotStatus(r.status);
    if (!status) {
      issues.push({ row, column: "status", message: `"${str(r.status)}" is not valid — use available or blocked` });
    }

    if (project_id && plot_no) {
      const key = `${project_id}::${plot_no.toLowerCase()}`;
      const firstSeen = seenInFile.get(key);
      if (firstSeen) {
        issues.push({
          row,
          column: "plot_no",
          message: `Duplicate of row ${firstSeen} — plot ${plot_no} appears twice for ${projectName}`,
        });
      } else if (takenPlotNo.has(key)) {
        issues.push({
          row,
          column: "plot_no",
          message: `Plot ${plot_no} already exists in ${projectName} — remove this row`,
        });
      } else {
        seenInFile.set(key, row);
      }
    }

    if (issues.length === before) {
      records.push({
        __row: row,
        project_id: project_id!,
        projectName,
        block: str(r.block),
        plot_no,
        sqft: sqftCell.value,
        price_per_sqft: priceCell.value,
        description: str(r.description) || null,
        status: status!,
      });
    }
  }

  return { issues, records };
}

// ── Report building ─────────────────────────────────────────────────────────

function buildReport(
  file: File,
  sheet: Sheet,
  issues: RowIssue[],
  previewHeaders: string[],
  previewRows: string[][],
): ImportReport {
  // Sort by row so the user works down their sheet top to bottom.
  const sorted = [...issues].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return {
    fileName: file.name,
    fileSize: file.size,
    totalRows: sheet.rows.length,
    issues: sorted,
    previewHeaders,
    previewRows,
  };
}

// ── Projects: validate + commit ─────────────────────────────────────────────

const PROJECT_REQUIRED_HEADERS = PROJECT_COLUMNS.filter((c) => c.required).map((c) => c.header);
const PLOT_REQUIRED_HEADERS = PLOT_COLUMNS.filter((c) => c.required).map((c) => c.header);

type Loaded = { ok: true; file: File; sheet: Sheet } | { ok: false; error: string };

/** Read + shape-check an upload. Never touches the database. */
async function loadSheet(formData: FormData, requiredHeaders: string[]): Promise<Loaded> {
  const file = getFile(formData);
  if (!file) return { ok: false, error: "Please choose an .xlsx or .csv file first." };
  let sheet: Sheet;
  try {
    sheet = await readSheet(file);
  } catch {
    return { ok: false, error: "Could not read that file. Use the downloadable template (.xlsx or .csv)." };
  }
  const shape = checkShape(sheet, requiredHeaders);
  if (shape) return { ok: false, error: shape };
  return { ok: true, file, sheet };
}

export async function importProjects(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireCapability("manage_projects");

  const loaded = await loadSheet(formData, PROJECT_REQUIRED_HEADERS);
  if (!loaded.ok) return { phase: "rejected", error: loaded.error };
  const { file, sheet } = loaded;

  const { issues, records } = await analyseProjects(sheet);

  const previewHeaders = ["Row", "Name", "District", "City", "Area", "Approval", "Type", "Status"];
  const previewRows = records
    .slice(0, PREVIEW_ROWS)
    .map((p) => [String(p.__row), p.name, p.district, p.city, p.area, p.approval_type, p.project_type, p.status]);

  // Any problem refuses the ENTIRE upload — nothing is written, so the sheet can
  // never land half-imported. The user corrects it and uploads again.
  if (issues.length > 0) {
    return { phase: "invalid", report: buildReport(file, sheet, issues, previewHeaders, previewRows) };
  }

  // Clean file → write every row in a single statement so it lands all-or-nothing.
  const payload = records.map(({ __row, ...rest }) => ({ ...rest, created_by: actor.id }));
  const { error } = await getSupabase().from("projects").insert(payload);
  if (error) {
    return {
      phase: "invalid",
      report: buildReport(file, sheet, [{ row: null, column: "—", message: `Nothing was saved — the database rejected the file: ${error.message}` }], previewHeaders, previewRows),
    };
  }

  await logAudit(actor, "project", null, "bulk_import", `${payload.length} project(s) via Excel (${file.name})`);
  revalidatePath("/projects");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { phase: "imported", created: payload.length, fileName: file.name };
}

// ── Plots: validate + commit ────────────────────────────────────────────────

export async function importPlots(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireCapability("manage_projects");

  const loaded = await loadSheet(formData, PLOT_REQUIRED_HEADERS);
  if (!loaded.ok) return { phase: "rejected", error: loaded.error };
  const { file, sheet } = loaded;

  const { issues, records } = await analysePlots(sheet);

  const previewHeaders = ["Row", "Project", "Block", "Plot No", "Sq.ft", "₹ / sq.ft", "Status"];
  const previewRows = records
    .slice(0, PREVIEW_ROWS)
    .map((p) => [
      String(p.__row),
      p.projectName,
      p.block || "—",
      p.plot_no,
      String(p.sqft),
      String(p.price_per_sqft),
      p.status,
    ]);

  // Any problem refuses the ENTIRE upload — nothing is written, so the sheet can
  // never land half-imported. The user corrects it and uploads again.
  if (issues.length > 0) {
    return { phase: "invalid", report: buildReport(file, sheet, issues, previewHeaders, previewRows) };
  }

  const sb = getSupabase();

  // Blocks (categories) referenced by the file must exist before the plots do.
  // Track the ones we create so they can be rolled back if the plot insert fails.
  const catByKey = new Map<string, string>();
  const neededProjectIds = [...new Set(records.map((r) => r.project_id))];
  if (neededProjectIds.length) {
    const { data: cats } = await sb.from("plot_categories").select("id, project_id, name").in("project_id", neededProjectIds);
    for (const c of cats ?? []) catByKey.set(`${c.project_id}::${str(c.name).toLowerCase()}`, c.id as string);
  }

  const toCreate = new Map<string, { project_id: string; name: string }>();
  for (const r of records) {
    if (!r.block) continue;
    const key = `${r.project_id}::${r.block.toLowerCase()}`;
    if (!catByKey.has(key) && !toCreate.has(key)) toCreate.set(key, { project_id: r.project_id, name: r.block });
  }

  const createdCatIds: string[] = [];
  if (toCreate.size) {
    const { data: newCats, error: catErr } = await sb
      .from("plot_categories")
      .insert([...toCreate.values()])
      .select("id, project_id, name");
    if (catErr || !newCats) {
      return {
        phase: "invalid",
        report: buildReport(file, sheet, [{ row: null, column: "block", message: `Nothing was saved — could not create the blocks: ${catErr?.message ?? "unknown error"}` }], previewHeaders, previewRows),
      };
    }
    for (const c of newCats) {
      catByKey.set(`${c.project_id}::${str(c.name).toLowerCase()}`, c.id as string);
      createdCatIds.push(c.id as string);
    }
  }

  const payload = records.map((r) => ({
    project_id: r.project_id,
    plot_category_id: r.block ? (catByKey.get(`${r.project_id}::${r.block.toLowerCase()}`) ?? null) : null,
    plot_no: r.plot_no,
    sqft: r.sqft,
    price_per_sqft: r.price_per_sqft,
    description: r.description,
    status: r.status,
  }));

  const { error } = await sb.from("plots").insert(payload);
  if (error) {
    // Undo the blocks we just made so a failed upload leaves no trace.
    if (createdCatIds.length) await sb.from("plot_categories").delete().in("id", createdCatIds);
    return {
      phase: "invalid",
      report: buildReport(file, sheet, [{ row: null, column: "—", message: `Nothing was saved — the database rejected the file: ${error.message}` }], previewHeaders, previewRows),
    };
  }

  await logAudit(actor, "plot", null, "bulk_import", `${payload.length} plot(s) via Excel (${file.name})`);
  revalidatePath("/plots");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return { phase: "imported", created: payload.length, fileName: file.name };
}
