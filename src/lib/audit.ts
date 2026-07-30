import "server-only";
import { getSupabase } from "./supabase";
import { isHiddenUser } from "./hidden-users";
import type { SessionUser } from "./session";

export async function logAudit(
  actor: SessionUser | null,
  entity: string,
  entityId: string | null,
  action: string,
  details?: string,
): Promise<void> {
  // The hidden dev account is invisible everywhere, including here — its
  // role-switch testing must not pollute the Activity Log with entries nobody
  // can attribute to a real person.
  if (isHiddenUser(actor?.email)) return;
  try {
    await getSupabase()
      .from("audit_log")
      .insert({
        actor_id: actor?.id ?? null,
        actor_name: actor?.full_name ?? null,
        entity,
        entity_id: entityId,
        action,
        details: details ?? null,
      });
  } catch {
    // Audit logging must never break a business action.
  }
}

// SMS / voice / panel notification stub — recorded to the notifications table.
// (board: "SMS: Booking Confirmed..." + "Voice")
export async function notify(
  bookingId: string | null,
  channel: "sms" | "voice" | "panel",
  recipient: string | null,
  message: string,
): Promise<void> {
  try {
    await getSupabase()
      .from("notifications")
      .insert({ booking_id: bookingId, channel, recipient, message });
  } catch {
    // best effort
  }
}
