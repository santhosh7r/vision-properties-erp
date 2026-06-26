import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ownBookedCustomerIds, ownCustomerOrFilter, networkBookedCustomerIds, networkCustomerOrFilter } from "@/lib/customers";
import { getDownlineIds } from "@/lib/hierarchy";
import { isNetworkHead } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { Plus } from "@/components/icons";
import type { Customer } from "@/lib/types";
import CustomersTable, { type CustomerRow } from "./CustomersTable";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireCapability("manage_customers");
  const sb = getSupabase();
  // Admin sees every customer. The Senior Director — the head of the network —
  // sees their whole downline's customers rolled up. Everyone else (Director and
  // below) sees ONLY THEIR OWN: customers they created, or attached to a block /
  // booking they made. A customer is "theirs" when they created it OR booked with
  // it (as creator or partner). Only the network head aggregates the team.
  const isAdmin = user.role === "admin";
  let query = sb
    .from("customers")
    .select("*, bookings(count)")
    .order("created_at", { ascending: false });
  if (!isAdmin) {
    if (isNetworkHead(user.role)) {
      const ids = await getDownlineIds(sb, user.id);
      const bookedIds = await networkBookedCustomerIds(sb, ids);
      query = query.or(networkCustomerOrFilter(ids, bookedIds));
    } else {
      const bookedIds = await ownBookedCustomerIds(sb, user.id);
      query = query.or(ownCustomerOrFilter(user.id, bookedIds));
    }
  }
  const { data } = await query;
  const raw = (data ?? []) as (Customer & { bookings: { count: number }[] })[];

  // When the list spans more than one salesperson (Admin = everyone, Senior
  // Director = their network) show whose customer each row is — i.e. who added it.
  const showOwner = isAdmin || isNetworkHead(user.role);
  const ownerName = new Map<string, string>();
  if (showOwner) {
    const creatorIds = [...new Set(raw.map((c) => c.created_by).filter((v): v is string => Boolean(v)))];
    if (creatorIds.length) {
      const { data: owners } = await sb.from("users").select("id, full_name").in("id", creatorIds);
      for (const o of (owners ?? []) as { id: string; full_name: string }[]) ownerName.set(o.id, o.full_name);
    }
  }

  const rows: CustomerRow[] = raw.map((c) => ({
    id: c.id,
    name: c.name,
    mobile: c.mobile,
    location: [c.area, c.district].filter(Boolean).join(", "),
    occupation: c.occupation ?? "",
    plots: c.bookings?.[0]?.count ?? 0,
    created_at: c.created_at,
    owner: c.created_by ? ownerName.get(c.created_by) ?? "—" : "—",
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
      <CustomersTable rows={rows} showOwner={showOwner} />
    </>
  );
}
