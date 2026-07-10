// Single source of truth for the bulk-import Excel format. Both the downloadable
// templates and the upload parser are generated from these column lists so the
// header a user fills in always matches what the importer reads.

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example: string | number;
  note: string;
  // For dropdown fields: every accepted value + what it means. Drives the
  // "Dropdown Values" sheet and one worked example row per option.
  options?: { value: string; label: string }[];
}

// Dropdown option sets (mirror the app's form selects / DB enums).
const DISTRICT_OPTS = [
  { value: "Chennai", label: "Chennai" },
  { value: "Trichy", label: "Trichy" },
];
const APPROVAL_OPTS = [
  { value: "dtcp_rera", label: "DTCP + RERA" },
  { value: "dtcp_only", label: "DTCP Only" },
];
const PROJECT_TYPE_OPTS = [
  { value: "affordable", label: "Affordable Project" },
  { value: "luxury", label: "Luxury Project" },
];
const PROJECT_STATUS_OPTS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
];
const PLOT_STATUS_OPTS = [
  { value: "available", label: "Vacant" },
  { value: "blocked", label: "Not Vacant" },
];

// ── Projects ────────────────────────────────────────────────────────────────
export const PROJECT_COLUMNS: ImportColumn[] = [
  { key: "name", header: "name", required: true, example: "Green Valley", note: "Project name (required, must be unique)" },
  { key: "district", header: "district", required: true, example: "Chennai", note: "Dropdown — type one of the values from the Dropdown Values sheet", options: DISTRICT_OPTS },
  { key: "city", header: "city", required: true, example: "Chennai", note: "City (required)" },
  { key: "pincode", header: "pincode", example: "600001", note: "Pincode (optional)" },
  { key: "area", header: "area", required: true, example: "2.5 acres", note: "Extent / area (required), free text" },
  { key: "approval_type", header: "approval_type", required: true, example: "dtcp_rera", note: "Dropdown — type exactly: dtcp_rera or dtcp_only", options: APPROVAL_OPTS },
  { key: "project_type", header: "project_type", required: true, example: "affordable", note: "Dropdown — type exactly: affordable or luxury", options: PROJECT_TYPE_OPTS },
  { key: "status", header: "status", example: "draft", note: "Dropdown — type exactly: draft, active, on_hold or closed (default draft)", options: PROJECT_STATUS_OPTS },
  { key: "branch", header: "branch", example: "Main Branch", note: "Branch / office (optional)" },
  { key: "guideline_value", header: "guideline_value", example: 1500, note: "₹ per sq.ft guideline value (optional)" },
  { key: "director_gold_coupon", header: "director_gold_coupon", example: 0, note: "Director Gold Coupon ₹ per sq.ft (optional, default 0)" },
  { key: "director_digital_coupon", header: "director_digital_coupon", example: 0, note: "Director Digital Coupon ₹ per sq.ft (optional, default 0)" },
  { key: "senior_director_gold_coupon", header: "senior_director_gold_coupon", example: 0, note: "Senior Director Gold Coupon ₹ per sq.ft (optional, default 0)" },
  { key: "director_tools_coupon", header: "director_tools_coupon", example: 0, note: "Director Tools Coupon ₹ per sq.ft (optional, default 0)" },
  { key: "blocking_amount", header: "blocking_amount", example: 10000, note: "Initial block amount ₹ (default 10000)" },
  { key: "blocking_window_hours", header: "blocking_window_hours", example: 48, note: "Block → must book within N hours (default 48)" },
  { key: "advance_percent", header: "advance_percent", example: 5, note: "Booking advance = N% of value (default 5)" },
  { key: "advance_min_amount", header: "advance_min_amount", example: 50000, note: "Advance floor ₹ (default 50000)" },
  { key: "booking_window_days", header: "booking_window_days", example: 15, note: "Booking → full payment within N days (default 15)" },
  { key: "cancel_full_refund_days", header: "cancel_full_refund_days", example: 3, note: "100% refund if cancelled within N days (default 3)" },
  { key: "cancellation_charge", header: "cancellation_charge", example: 5000, note: "Admin charge per plot ₹ (default 5000)" },
  { key: "refund_processing_days", header: "refund_processing_days", example: 5, note: "Refund payout SLA in working days (default 5)" },
  { key: "transfer_charge", header: "transfer_charge", example: 5000, note: "Transfer/downgrade charge per plot ₹ (default 5000)" },
];

// ── Plots ───────────────────────────────────────────────────────────────────
export const PLOT_COLUMNS: ImportColumn[] = [
  { key: "project", header: "project", required: true, example: "Green Valley", note: "Existing project name (required, must match exactly)" },
  { key: "block", header: "block", example: "Phase 1", note: "Block / category name (free text) — created automatically if new" },
  { key: "plot_no", header: "plot_no", required: true, example: "A-101", note: "Plot number (required, unique within the project)" },
  { key: "sqft", header: "sqft", required: true, example: 1200, note: "Plot area in sq.ft (required, number > 0)" },
  { key: "price_per_sqft", header: "price_per_sqft", example: 1500, note: "₹ per sq.ft — drives plot value (optional, default 0). Value = sqft × this." },
  { key: "description", header: "description", example: "Corner plot", note: "Notes (optional)" },
  { key: "status", header: "status", example: "available", note: "Dropdown — type exactly: available (Vacant) or blocked (Not Vacant); default available", options: PLOT_STATUS_OPTS },
];

// ── Enum normalizers (accept the code or the human label, case-insensitive) ──
function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function normApprovalType(v: unknown): "dtcp_rera" | "dtcp_only" | null {
  const s = norm(v).replace(/[\s+]+/g, "_");
  if (["dtcp_rera", "dtcp_&_rera", "dtcp_rera", "dtcprera"].includes(s) || s.includes("rera")) return "dtcp_rera";
  if (["dtcp_only", "dtcp", "dtcponly"].includes(s) || s.startsWith("dtcp")) return "dtcp_only";
  return null;
}

export function normProjectType(v: unknown): "affordable" | "luxury" | null {
  const s = norm(v);
  if (s.startsWith("afford")) return "affordable";
  if (s.startsWith("lux")) return "luxury";
  return null;
}

export function normProjectStatus(v: unknown): "draft" | "active" | "on_hold" | "closed" {
  const s = norm(v).replace(/\s+/g, "_");
  if (["active", "on_hold", "closed", "draft"].includes(s)) return s as "draft" | "active" | "on_hold" | "closed";
  return "draft";
}

export function normPlotStatus(v: unknown): "available" | "blocked" | null {
  const s = norm(v);
  if (!s) return "available";
  if (["available", "vacant", "free"].includes(s)) return "available";
  if (["blocked", "not_vacant", "not vacant", "notvacant"].includes(s) || s.startsWith("block")) return "blocked";
  return null;
}

// Parse a numeric cell that may arrive as "₹1,500", "1500", 1500, or blank.
export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
