import "server-only";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./session";
import { getSupabase } from "./supabase";
import { logAudit } from "./audit";

// Server-only half of lib/bill. Deliberately NOT in a "use server" file: those
// exports become actions callable from the browser with any arguments.

/**
 * Withdraw bill verification from live deals whose verified details a sales
 * role just changed, so Admin has to check them again before a bill prints.
 * `customerId` widens it to every live deal of that customer — their details
 * print on all of their bills. Logged per booking, so the Activity Log says why
 * a bill that used to print now waits.
 */
export async function withdrawBillVerification(
  actor: SessionUser,
  target: { bookingIds?: string[]; customerId?: string | null },
  why: string,
): Promise<void> {
  const ids = target.bookingIds ?? [];
  if (!target.customerId && ids.length === 0) return;
  let q = getSupabase()
    .from("bookings")
    .update({ bill_verified_at: null, bill_verified_by: null })
    .not("bill_verified_at", "is", null)
    .neq("status", "cancelled");
  q = target.customerId
    ? q.or(`customer_id.eq.${target.customerId}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`)
    : q.in("id", ids);
  const { data } = await q.select("id");
  for (const r of (data ?? []) as { id: string }[]) {
    await logAudit(actor, "booking", r.id, "unverify", `bill needs Admin verification again — ${why}`);
    revalidatePath(`/bookings/${r.id}`);
  }
  revalidatePath("/bookings");
}
