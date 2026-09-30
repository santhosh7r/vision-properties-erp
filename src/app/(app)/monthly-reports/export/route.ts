import { requirePage } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { captureError } from "@/lib/errors/capture";
import { parseMonth } from "@/lib/reports/period";
import { getReportAccess, reportNotes, resolveSelection } from "@/lib/reports/context";
import { runReport } from "@/lib/reports/data";
import { buildReportWorkbook } from "@/lib/reports/workbook";
import { ROLE_LABELS } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monthly report download.
//   /monthly-reports/export?month=2026-09&sel=bookings        one report
//   /monthly-reports/export?month=2026-09&sel=dept:finance    a department
//   /monthly-reports/export?month=2026-09&sel=all             everything allowed
//
// A route handler is not wrapped by the app layout, so Page Config is enforced
// here (requirePage), and each report is checked against the user's own
// capabilities. The path deliberately does not end in .xlsx: the middleware
// skips such paths, and with it the session gate.
export async function GET(req: Request): Promise<Response> {
  const { user } = await requirePage("monthly_reports");
  const url = new URL(req.url);

  const period = parseMonth(url.searchParams.get("month"));
  if (!period) return text(400, "Pick a valid month — this month or an earlier one.");

  const access = await getReportAccess(user);
  const selection = resolveSelection(url.searchParams.get("sel"), access.reports);
  if (!selection) return text(403, "That report is not available to your account.");

  try {
    const ctx = access.context(period);
    const results = await Promise.all(selection.reports.map((r) => runReport(r.key, ctx)));
    const wb = buildReportWorkbook(results, {
      period,
      scopeLabel: access.scopeLabel,
      generatedBy: `${user.full_name} (${ROLE_LABELS[user.role] ?? user.role})`,
      generatedAt: new Date(),
      notes: reportNotes(access, results),
    });
    const buf = await wb.xlsx.writeBuffer();

    const rows = results.reduce((s, r) => s + r.rows.length, 0);
    // Exports carry customer names and phone numbers — every one is logged.
    await logAudit(
      user,
      "report",
      null,
      "export",
      `${selection.label} · ${period.label} · ${access.scopeLabel} · ${rows} rows`,
    );

    const branch = access.scope?.district ? `-${access.scope.district.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    const filename = `vision-${selection.slug}-${period.key}${branch}.xlsx`;
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (err) {
    // Never hand over a partial file: a report that silently lost rows would be
    // trusted. Fail visibly with a reference the user can quote.
    const { shortId, eventId } = await captureError(err, {
      module: "reports",
      route: "/monthly-reports/export",
      httpMethod: "GET",
      httpStatus: 500,
      context: { month: period.key, sel: url.searchParams.get("sel") },
    });
    return text(500, `Couldn't build the report. Please try again; if it keeps failing, quote ${shortId ?? eventId}.`);
  }
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
