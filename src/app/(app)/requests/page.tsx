import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDownlineIds } from "@/lib/hierarchy";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { can } from "@/lib/roles";
import { canActOnStage, type RequestStage } from "@/lib/requests";
import { PageHeader } from "@/components/ui";
import type { ServiceRequest, Customer } from "@/lib/types";
import RequestsWorkspace, {
  type RequestRow,
  type MiniBooking,
} from "./RequestsWorkspace";

export const dynamic = "force-dynamic";

const ALL_STAGES: RequestStage[] = ["senior", "presales", "legal", "accounts", "done"];

type RawRequest = ServiceRequest & {
  customers: Pick<Customer, "name" | "mobile"> | null;
  bookings:
    | { id: string; block: string | null; projects: { name: string } | null; plots: { plot_no: string } | null }
    | null;
  requester: { full_name: string } | null;
};

function toRow(r: RawRequest): RequestRow {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    stage: r.stage,
    customer: r.customers?.name ?? null,
    mobile: r.customers?.mobile ?? null,
    booking: r.bookings
      ? `${r.bookings.projects?.name ?? "—"} · Plot ${r.bookings.plots?.plot_no ?? "—"}`
      : null,
    requestedBy: r.requester?.full_name ?? "—",
    subject: r.subject,
    details: r.details,
    response: r.response,
    visit_date: r.visit_date,
    pickup: r.pickup,
    decline_reason: r.decline_reason,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export default async function RequestsPage() {
  const user = await requireUser();
  const sb = getSupabase();
  const isAdmin = user.role === "admin";
  // Admin only APPROVES requests on this panel — they never raise new ones.
  const canCreate = !isAdmin && can(user.role, "create_request");

  const SELECT =
    "*, customers(name, mobile), bookings(id, block, projects(name), plots(plot_no)), requester:users!requested_by(full_name)";

  // Stages this role can act on — drives the approver "inbox".
  const inboxStages = ALL_STAGES.filter((st) => canActOnStage(user.role, st));

  // 1) Team view — requests raised by the user's downline (admins skip; they see all).
  const ids = isAdmin ? [] : await getDownlineIds(sb, user.id);

  const byId = new Map<string, RawRequest>();
  let migrationMissing = false;

  if (isAdmin) {
    const { data, error } = await sb.from("service_requests").select(SELECT).order("created_at", { ascending: false });
    if (error) migrationMissing = true;
    for (const r of (data ?? []) as RawRequest[]) byId.set(r.id, r);
  } else {
    const teamRes = await sb
      .from("service_requests")
      .select(SELECT)
      .in("requested_by", ids)
      .order("created_at", { ascending: false });
    if (teamRes.error) migrationMissing = true;
    for (const r of (teamRes.data ?? []) as RawRequest[]) byId.set(r.id, r);

    // 2) Approver inbox — pending requests sitting at a stage this role handles.
    if (inboxStages.length > 0) {
      const inboxRes = await sb
        .from("service_requests")
        .select(SELECT)
        .eq("status", "pending")
        .in("stage", inboxStages)
        .order("created_at", { ascending: false });
      for (const r of (inboxRes.data ?? []) as RawRequest[]) byId.set(r.id, r);
    }
  }

  const rows: RequestRow[] = [...byId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(toRow);

  // Pickers for the create form — the user's OWN customers and bookings.
  let custQ = sb.from("customers").select("id, name, mobile").order("name");
  if (!isAdmin) {
    const bookedIds = await ownBookedCustomerIds(sb, user.id);
    custQ = custQ.or(ownCustomerOrFilter(user.id, bookedIds));
  }
  const { data: custData } = await custQ;
  const customers = (custData ?? []) as Pick<Customer, "id" | "name" | "mobile">[];

  let bookingQ = sb
    .from("bookings")
    .select("id, block, status, customers(name), projects(name), plots(plot_no)")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (!isAdmin) bookingQ = bookingQ.or(`created_by.in.(${ids.join(",")}),partner_id.in.(${ids.join(",")})`);
  const { data: bkData } = await bookingQ;
  const bookings: MiniBooking[] = ((bkData ?? []) as any[]).map((b) => ({
    id: b.id,
    label: `${b.projects?.name ?? "—"} · Plot ${b.plots?.plot_no ?? "—"} · ${b.customers?.name ?? "—"}`,
  }));

  return (
    <>
      <PageHeader
        title={isAdmin ? "Approvals" : "Requests"}
        subtitle="Raise and track site-visit, legal, draft, registration and cancellation requests through their approval chain."
      />
      <RequestsWorkspace
        rows={rows}
        customers={customers}
        bookings={bookings}
        userRole={user.role}
        canCreate={canCreate}
        migrationMissing={migrationMissing}
      />
    </>
  );
}
