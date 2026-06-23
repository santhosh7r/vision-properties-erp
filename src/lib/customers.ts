import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
