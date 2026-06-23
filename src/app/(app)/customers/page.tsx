import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ownBookedCustomerIds, ownCustomerOrFilter } from "@/lib/customers";
import { PageHeader } from "@/components/ui";
import { Plus } from "@/components/icons";
import type { Customer } from "@/lib/types";
import CustomersTable, { type CustomerRow } from "./CustomersTable";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireCapability("manage_customers");
  const sb = getSupabase();
  // Admin sees every customer. A sales user sees ONLY THEIR OWN customers — never
  // their downline's. A customer is "theirs" when:
  //   1. they created the customer, OR
  //   2. the customer is attached to a block/booking made with THEIR OWN Partner
  //      ID (so when Admin blocks using this person's ID, that client shows here).
  // Downline customers stay with the downline member — they do NOT roll up.
  const isAdmin = user.role === "admin";
  let query = sb
    .from("customers")
    .select("*, bookings(count)")
    .order("created_at", { ascending: false });
  if (!isAdmin) {
    const bookedIds = await ownBookedCustomerIds(sb, user.id);
    query = query.or(ownCustomerOrFilter(user.id, bookedIds));
  }
  const { data } = await query;
  const raw = (data ?? []) as (Customer & { bookings: { count: number }[] })[];

  const rows: CustomerRow[] = raw.map((c) => ({
    id: c.id,
    name: c.name,
    mobile: c.mobile,
    location: [c.area, c.district].filter(Boolean).join(", "),
    occupation: c.occupation ?? "",
    plots: c.bookings?.[0]?.count ?? 0,
    created_at: c.created_at,
  }));

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="The customer master. A customer must exist before any plot is blocked or booked."
        action={
          <Link href="/customers/new" className="btn-primary">
            <Plus size={16} /> Add Customer
          </Link>
        }
      />
      <CustomersTable rows={rows} />
    </>
  );
}
