import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import type { CabRequest, Customer } from "@/lib/types";
import RequestsWorkspace, { type RequestRow } from "./RequestsWorkspace";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await requireUser();
  const sb = getSupabase();
  const isAdmin = user.role === "admin";
  const canRequest = can(user.role, "request_cab");
  const canApprove = can(user.role, "approve_cab");

  // Admin sees every request; a salesperson sees only the ones they raised.
  let q = sb
    .from("cab_requests")
    .select("*, customers(name, mobile), requester:users!requested_by(full_name)")
    .order("created_at", { ascending: false });
  if (!isAdmin) q = q.eq("requested_by", user.id);
  const { data, error } = await q;

  // If migration 0008 hasn't been applied yet the table is missing — show a
  // notice instead of crashing.
  const migrationMissing = Boolean(error);

  const raw = (data ?? []) as (CabRequest & {
    customers: Pick<Customer, "name" | "mobile"> | null;
    requester: { full_name: string } | null;
  })[];

  const rows: RequestRow[] = raw.map((r) => ({
    id: r.id,
    customer: r.customers?.name ?? "—",
    mobile: r.customers?.mobile ?? "—",
    requestedBy: r.requester?.full_name ?? "—",
    cab_date: r.cab_date,
    pickup: r.pickup,
    notes: r.notes,
    status: r.status,
    decline_reason: r.decline_reason,
    created_at: r.created_at,
  }));

  // Clients for the request form — a salesperson's OWN customers (same rule as
  // the Customers panel: created by them OR booked with their own id). Admin: all.
  let custQ = sb.from("customers").select("id, name, mobile").order("name");
  if (!isAdmin) {
    const bookedIds = await ownBookedCustomerIds(sb, user.id);
    custQ = custQ.or(ownCustomerOrFilter(user.id, bookedIds));
  }
  const { data: custData } = await custQ;
  const customers = (custData ?? []) as Pick<Customer, "id" | "name" | "mobile">[];

  return (
    <>
      <PageHeader
        title="Cab Requests"
        subtitle={
          isAdmin
            ? "Cab requests raised by the sales team for their clients. Approve or decline."
            : "Request a cab for your clients on a chosen date. Admin will approve or decline."
        }
      />
      <RequestsWorkspace
        rows={rows}
        customers={customers}
        canRequest={canRequest}
        canApprove={canApprove}
        isAdmin={isAdmin}
        migrationMissing={migrationMissing}
      />
    </>
  );
}
