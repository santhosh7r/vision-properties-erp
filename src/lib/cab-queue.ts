import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "./session";
import { PRE_SALES_DESK_ROLES, type Role } from "./roles";
import { getDistrictScope, withRequestScope } from "./scope";
import { fetchAllRows } from "./fetch-all";

// ---------------------------------------------------------------------------
// The Pre-Sales desk's cab queue — pending cab / site-visit requests on its
// branch. A Director's request goes Senior Director → Pre-Sales; a Senior
// Director's own request starts at Pre-Sales (lib/requests initialStageFor).
//   • awaitingYou    — at the Pre-sales stage: the desk approves or declines.
//   • awaitingSenior — raised, still with the Senior Director: the desk can see
//                      it coming and plan the cab, but cannot act yet.
// Scoped exactly like the Approvals page (withRequestScope), so the dashboard
// panel, the sidebar count and the pop-up never disagree with the list.
// ---------------------------------------------------------------------------

/** Roles that get the cab queue on the dashboard, the badge and the pop-up. */
export function watchesCabQueue(role: Role): boolean {
  return PRE_SALES_DESK_ROLES.includes(role);
}

export interface CabQueueItem {
  id: string;
  customer: string;
  phone: string | null;
  project: string | null;
  visitDate: string | null; // YYYY-MM-DD
  visitTime: string | null; // HH:MM
  requestedBy: string;
  createdAt: string;
}

export interface CabQueue {
  awaitingYou: CabQueueItem[];
  awaitingSenior: CabQueueItem[];
}

interface Raw {
  id: string;
  stage: string;
  created_at: string;
  visit_date: string | null;
  visit_time: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customers: { name: string; mobile: string | null } | null;
  project: { name: string } | null;
  requester: { full_name: string } | null;
}

export async function getCabQueue(sb: SupabaseClient, user: SessionUser): Promise<CabQueue> {
  const scope = await getDistrictScope(sb, user);
  const rows = await fetchAllRows<Raw>(
    (from, to) =>
      withRequestScope(
        sb
          .from("service_requests")
          .select(
            "id, stage, created_at, visit_date, visit_time, customer_name, customer_phone, " +
              "customers(name, mobile), project:projects!project_id(name), requester:users!requested_by(full_name)",
          )
          .eq("type", "cab")
          .eq("status", "pending")
          .in("stage", ["senior", "presales"]),
        scope,
      )
        // Soonest visit first — that is the order the desk has to act in.
        .order("visit_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    { strict: true },
  );

  const toItem = (r: Raw): CabQueueItem => ({
    id: r.id,
    customer: r.customers?.name ?? r.customer_name ?? "Walk-in customer",
    phone: r.customers?.mobile ?? r.customer_phone ?? null,
    project: r.project?.name ?? null,
    visitDate: r.visit_date,
    visitTime: r.visit_time ? String(r.visit_time).slice(0, 5) : null,
    requestedBy: r.requester?.full_name ?? "—",
    createdAt: r.created_at,
  });
  return {
    awaitingYou: rows.filter((r) => r.stage === "presales").map(toItem),
    awaitingSenior: rows.filter((r) => r.stage === "senior").map(toItem),
  };
}
