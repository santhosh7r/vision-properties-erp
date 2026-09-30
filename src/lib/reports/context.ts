import "server-only";
import type { SessionUser } from "../session";
import { getSupabase } from "../supabase";
import { getDistrictScope, type DistrictScope } from "../scope";
import { DEPARTMENTS, REPORT_BY_KEY, reportsFor, type DepartmentKey, type ReportDef, type ReportKey } from "./catalog";
import type { ReportContext, ReportResult } from "./data";
import type { ReportPeriod } from "./period";

// What one user may export, resolved once and shared by the Monthly Reports page
// and its download route so the two can never disagree.

export interface ReportAccess {
  reports: ReportDef[];
  scope: DistrictScope | null;
  scopeLabel: string;
  context: (period: ReportPeriod) => ReportContext;
}

export async function getReportAccess(user: SessionUser): Promise<ReportAccess> {
  const sb = getSupabase();
  const scope = await getDistrictScope(sb, user);
  return {
    reports: reportsFor(user.role),
    scope,
    scopeLabel: !scope
      ? "Company-wide"
      : scope.district
        ? `${scope.district} branch`
        : "No branch set on this account",
    context: (period) => ({ sb, period, scope }),
  };
}

/**
 * Which reports a download asks for: one report ("bookings"), a department
 * ("dept:finance") or everything the user may see ("all"). Null when the ask is
 * malformed or names a report this user may not export — never silently
 * narrowed to what they can see, so a bad link fails loudly.
 */
export function resolveSelection(
  sel: string | null,
  allowed: ReportDef[],
): { reports: ReportDef[]; label: string; slug: string } | null {
  if (!sel) return null;
  if (sel === "all") {
    return allowed.length ? { reports: allowed, label: "All reports", slug: "all-reports" } : null;
  }
  if (sel.startsWith("dept:")) {
    const dept = DEPARTMENTS.find((d) => d.key === (sel.slice(5) as DepartmentKey));
    const reports = dept ? allowed.filter((r) => r.department === dept.key) : [];
    return dept && reports.length
      ? { reports, label: `${dept.label} reports`, slug: `${dept.key.replace(/_/g, "-")}-reports` }
      : null;
  }
  const def = REPORT_BY_KEY.get(sel as ReportKey);
  if (!def || !allowed.some((r) => r.key === def.key)) return null;
  return { reports: [def], label: def.title, slug: def.key.replace(/_/g, "-") };
}

/** Plain-language caveats printed on the Summary sheet. */
export function reportNotes(access: ReportAccess, results: ReportResult[]): string[] {
  const notes = [
    "All dates and times are India Standard Time. A month runs from 00:00 IST on the 1st to 00:00 IST on the 1st of the next month.",
    "Amounts are in ₹. Columns marked \"(now)\" show the record as it stands when this file was generated, not as it stood at month end.",
    "This file is built from live data. Downloading a past month again later can differ if records were since edited, converted, cancelled or registered.",
  ];
  if (access.scope) {
    notes.push(
      access.scope.district
        ? `Branch export: only records on ${access.scope.district} projects. Payments and plot transfers are included through their booking's project; site visits and legal queries not tied to any project are not included.`
        : "This account has no branch set, so no branch records are included. An Admin can set the branch on the user.",
    );
    if (results.some((r) => r.def.key === "tokens")) {
      notes.push("Tokens are company-wide, the same as on the Issue Token page — tokens are issued to salespeople, not to a branch.");
    }
  }
  return notes;
}
