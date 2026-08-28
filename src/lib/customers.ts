import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DistrictScope } from "./scope";

// A salesperson's "own" customers are those they created OR those attached to a
// block/booking made with THEIR OWN id (as the partner, or as the creator).
// Downline customers do NOT count — they belong to the downline member.
//
// `ownBookedCustomerIds` returns the customer ids reachable through that
// person's own bookings; `ownCustomerOrFilter` builds the PostgREST `.or()`
// string used to scope a customers query. Both the Customers page and the cab
// request client picker use these so they always show the same set.

export async function ownBookedCustomerIds(
  sb: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await sb
    .from("bookings")
    .select("customer_id")
    .or(`created_by.eq.${userId},partner_id.eq.${userId}`);
  return [
    ...new Set(
      ((data ?? []) as { customer_id: string | null }[])
        .map((b) => b.customer_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

export function ownCustomerOrFilter(userId: string, bookedCustomerIds: string[]): string {
  const ors = [`created_by.eq.${userId}`];
  if (bookedCustomerIds.length) ors.push(`id.in.(${bookedCustomerIds.join(",")})`);
  return ors.join(",");
}

// Network versions — same idea as the "own" helpers above, but rolled up across a
// manager's whole downline (the id list from getDownlineIds, which includes self).
// A manager sees a customer when ANYONE in their subtree created it OR booked with
// it. For a leaf member (downline = just themselves) this is identical to the
// "own" scope, so behaviour only widens for people who actually manage others.
export async function networkBookedCustomerIds(
  sb: SupabaseClient,
  ids: string[],
): Promise<string[]> {
  const list = ids.join(",");
  const { data } = await sb
    .from("bookings")
    .select("customer_id")
    .or(`created_by.in.(${list}),partner_id.in.(${list})`);
  return [
    ...new Set(
      ((data ?? []) as { customer_id: string | null }[])
        .map((b) => b.customer_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

export function networkCustomerOrFilter(ids: string[], bookedCustomerIds: string[]): string {
  const ors = [`created_by.in.(${ids.join(",")})`];
  if (bookedCustomerIds.length) ors.push(`id.in.(${bookedCustomerIds.join(",")})`);
  return ors.join(",");
}


// ---------------------------------------------------------------------------
// BRANCH SCOPE — which clients a Chennai / Trichy desk works.
//
// This used to be answered with the customer's own ADDRESS district
// (`customers.district ilike 'Chennai'`), which only held while an address was
// forced to be one of the company's two branches. A customer's address is now
// free text taken from their pincode — buyers live all over the country — so
// matching on it would hide a Chennai desk's own client the moment they turned
// out to live in Madurai.
//
// The branch is established from facts that are actually branch-bound:
//   · the client was entered by someone posted to that branch, OR
//   · the client has a block / booking in one of that branch's projects.
//
// That keeps the original intent — "the desk works every client of its branch,
// whoever entered them" — while letting the address be anything.
// ---------------------------------------------------------------------------

async function branchStaffIds(sb: SupabaseClient, district: string): Promise<string[]> {
  // ilike, not eq: users.district is free text on older rows ("chennai").
  const { data } = await sb.from("users").select("id").ilike("district", district);
  return ((data ?? []) as { id: string }[]).map((u) => u.id);
}

async function branchBookedCustomerIds(sb: SupabaseClient, projectIds: string[]): Promise<string[]> {
  if (!projectIds.length) return [];
  const { data } = await sb.from("bookings").select("customer_id").in("project_id", projectIds);
  return [
    ...new Set(
      ((data ?? []) as { customer_id: string | null }[])
        .map((b) => b.customer_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

/**
 * The PostgREST `.or()` string selecting a branch's clients, or **null** when
 * the branch can match none — an unconfigured desk, or one whose projects have
 * no bookings and whose staff have entered nobody. Null means "show nothing":
 * callers apply `.in("id", [])`, so an unconfigured branch fails closed exactly
 * as it did before.
 */
export async function branchCustomerOrFilter(
  sb: SupabaseClient,
  scope: DistrictScope,
): Promise<string | null> {
  if (!scope.district) return null;
  const [staffIds, bookedIds] = await Promise.all([
    branchStaffIds(sb, scope.district),
    branchBookedCustomerIds(sb, scope.projectIds),
  ]);
  const ors: string[] = [];
  if (staffIds.length) ors.push(`created_by.in.(${staffIds.join(",")})`);
  if (bookedIds.length) ors.push(`id.in.(${bookedIds.join(",")})`);
  return ors.length ? ors.join(",") : null;
}

// NOTE: callers apply this themselves rather than through a wrapper —
//     const f = await branchCustomerOrFilter(sb, scope);
//     q = f ? q.or(f) : q.in("id", []);
// A PostgREST builder is a thenable, so an async helper that took a query and
// returned it would EXECUTE the query on await instead of handing it back.

/** Does ONE customer belong to this branch? The single-record twin of the above. */
export async function customerInBranch(
  sb: SupabaseClient,
  scope: DistrictScope,
  customer: { id: string; created_by: string | null },
): Promise<boolean> {
  if (!scope.district) return false;
  if (customer.created_by) {
    const staffIds = await branchStaffIds(sb, scope.district);
    if (staffIds.includes(customer.created_by)) return true;
  }
  if (!scope.projectIds.length) return false;
  const { data } = await sb
    .from("bookings")
    .select("id")
    .eq("customer_id", customer.id)
    .in("project_id", scope.projectIds)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}
