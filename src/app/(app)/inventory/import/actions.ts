"use server";

import { Readable } from "stream";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireDevUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  PROJECT_COLUMNS,
  PLOT_COLUMNS,
  normApprovalType,
  normProjectType,
  normProjectStatus,
  normPlotStatus,
  num,
} from "@/lib/import-spec";

export type ImportResult =
  | { ok: true; created: number; skipped: number; errors: string[] }
  | { ok: false; error: string }
  | null;

const MAX_ROWS = 5000;

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

// Turn an uploaded .xlsx/.csv File into an array of row objects keyed by the
// header row, tagged with the source spreadsheet row number for error messages.
async function readRows(file: File): Promise<Array<Record<string, unknown> & { __row: number }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf: any = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    await wb.csv.read(Readable.from(buf));
  } else {
    await wb.xlsx.load(buf);
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = str(cell.value).toLowerCase();
  });

  const rows: Array<Record<string, unknown> & { __row: number }> = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, unknown> = {};
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (h) obj[h] = cell.value;
    });
    // skip fully blank rows
    if (Object.values(obj).some((v) => str(v) !== "")) rows.push({ __row: rowNum, ...obj });
  });
  return rows;
}

function getFile(formData: FormData): File | null {
  const f = formData.get("file");
  if (f && typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0) return f as File;
  return null;
}

// ── Projects ────────────────────────────────────────────────────────────────
export async function importProjects(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const actor = await requireDevUser(); // hidden dev account only
  const file = getFile(formData);
  if (!file) return { ok: false, error: "Please choose an .xlsx or .csv file." };

  let rows: Array<Record<string, unknown> & { __row: number }>;
  try {
    rows = await readRows(file);
  } catch {
    return { ok: false, error: "Could not read that file. Use the provided template (.xlsx or .csv)." };
  }
  if (rows.length === 0) return { ok: false, error: "No data rows found. Fill in the template below the header row." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `Too many rows (${rows.length}). Limit is ${MAX_ROWS} per upload.` };

  const sb = getSupabase();
  // Existing names + in-file names to prevent duplicate projects.
  const { data: existing } = await sb.from("projects").select("name");
  const seen = new Set((existing ?? []).map((p) => str(p.name).toLowerCase()));

  const errors: string[] = [];
  let created = 0;

  for (const r of rows) {
    const name = str(r.name);
    const district = str(r.district);
    const city = str(r.city);
    const area = str(r.area);
    const approval_type = normApprovalType(r.approval_type);
    const project_type = normProjectType(r.project_type);

    const missing = [
      !name && "name",
      !district && "district",
      !city && "city",
      !area && "area",
    ].filter(Boolean);
    if (missing.length) { errors.push(`Row ${r.__row}: missing ${missing.join(", ")}`); continue; }
    if (!approval_type) { errors.push(`Row ${r.__row}: approval_type must be dtcp_rera or dtcp_only`); continue; }
    if (!project_type) { errors.push(`Row ${r.__row}: project_type must be affordable or luxury`); continue; }
    if (seen.has(name.toLowerCase())) { errors.push(`Row ${r.__row}: project "${name}" already exists — skipped`); continue; }

    const { error } = await sb.from("projects").insert({
      name, district, city, area,
      pincode: str(r.pincode) || null,
      approval_type, project_type,
      status: normProjectStatus(r.status),
      branch: str(r.branch) || null,
      guideline_value: num(r.guideline_value),
      director_gold_coupon: num(r.director_gold_coupon),
      director_digital_coupon: num(r.director_digital_coupon),
      senior_director_gold_coupon: num(r.senior_director_gold_coupon),
      director_tools_coupon: num(r.director_tools_coupon),
      blocking_amount: num(r.blocking_amount, 10000),
      blocking_window_hours: num(r.blocking_window_hours, 48),
      advance_percent: num(r.advance_percent, 5),
      advance_min_amount: num(r.advance_min_amount, 50000),
      booking_window_days: num(r.booking_window_days, 15),
      cancel_full_refund_days: num(r.cancel_full_refund_days, 3),
      cancellation_charge: num(r.cancellation_charge, 5000),
      refund_processing_days: num(r.refund_processing_days, 5),
      transfer_charge: num(r.transfer_charge, 5000),
      created_by: actor.id,
    });
    if (error) { errors.push(`Row ${r.__row}: ${error.message}`); continue; }
    seen.add(name.toLowerCase());
    created += 1;
  }

  if (created > 0) {
    await logAudit(actor, "project", null, "bulk_import", `${created} project(s) via Excel`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
  }
  return { ok: true, created, skipped: rows.length - created, errors };
}

// ── Plots ───────────────────────────────────────────────────────────────────
export async function importPlots(_prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const actor = await requireDevUser(); // hidden dev account only
  const file = getFile(formData);
  if (!file) return { ok: false, error: "Please choose an .xlsx or .csv file." };

  let rows: Array<Record<string, unknown> & { __row: number }>;
  try {
    rows = await readRows(file);
  } catch {
    return { ok: false, error: "Could not read that file. Use the provided template (.xlsx or .csv)." };
  }
  if (rows.length === 0) return { ok: false, error: "No data rows found. Fill in the template below the header row." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `Too many rows (${rows.length}). Limit is ${MAX_ROWS} per upload.` };

  const sb = getSupabase();
  // Resolve projects by name.
  const { data: projects } = await sb.from("projects").select("id, name");
  const projByName = new Map((projects ?? []).map((p) => [str(p.name).toLowerCase(), p.id as string]));
  const projIds = (projects ?? []).map((p) => p.id as string);

  // Existing categories (block) per project, and existing plot_nos per project.
  const catByKey = new Map<string, string>(); // `${projectId}::${lowerName}` -> categoryId
  const takenPlotNo = new Set<string>(); // `${projectId}::${lowerPlotNo}`
  if (projIds.length) {
    const { data: cats } = await sb.from("plot_categories").select("id, project_id, name").in("project_id", projIds);
    for (const c of cats ?? []) catByKey.set(`${c.project_id}::${str(c.name).toLowerCase()}`, c.id as string);
    const { data: plots } = await sb.from("plots").select("project_id, plot_no").in("project_id", projIds);
    for (const p of plots ?? []) takenPlotNo.add(`${p.project_id}::${str(p.plot_no).toLowerCase()}`);
  }

  const errors: string[] = [];
  let created = 0;

  for (const r of rows) {
    const projectName = str(r.project);
    const plot_no = str(r.plot_no);
    const sqft = num(r.sqft);
    const status = normPlotStatus(r.status);

    if (!projectName) { errors.push(`Row ${r.__row}: missing project`); continue; }
    const project_id = projByName.get(projectName.toLowerCase());
    if (!project_id) { errors.push(`Row ${r.__row}: project "${projectName}" not found`); continue; }
    if (!plot_no) { errors.push(`Row ${r.__row}: missing plot_no`); continue; }
    if (!(sqft > 0)) { errors.push(`Row ${r.__row}: sqft must be a number greater than 0`); continue; }
    if (!status) { errors.push(`Row ${r.__row}: status must be available or blocked`); continue; }

    const dupKey = `${project_id}::${plot_no.toLowerCase()}`;
    if (takenPlotNo.has(dupKey)) { errors.push(`Row ${r.__row}: plot ${plot_no} already exists in ${projectName} — skipped`); continue; }

    // Resolve / create the block (category).
    let plot_category_id: string | null = null;
    const block = str(r.block);
    if (block) {
      const key = `${project_id}::${block.toLowerCase()}`;
      plot_category_id = catByKey.get(key) ?? null;
      if (!plot_category_id) {
        const { data: newCat, error: catErr } = await sb
          .from("plot_categories")
          .insert({ project_id, name: block })
          .select("id")
          .single();
        if (catErr || !newCat) { errors.push(`Row ${r.__row}: could not create block "${block}"`); continue; }
        plot_category_id = newCat.id as string;
        catByKey.set(key, plot_category_id);
      }
    }

    const { error } = await sb.from("plots").insert({
      project_id,
      plot_category_id,
      plot_no,
      sqft,
      price_per_sqft: num(r.price_per_sqft),
      description: str(r.description) || null,
      status,
    });
    if (error) { errors.push(`Row ${r.__row}: ${error.message}`); continue; }
    takenPlotNo.add(dupKey);
    created += 1;
  }

  if (created > 0) {
    await logAudit(actor, "plot", null, "bulk_import", `${created} plot(s) via Excel`);
    revalidatePath("/plots");
    revalidatePath("/dashboard");
  }
  return { ok: true, created, skipped: rows.length - created, errors };
}
