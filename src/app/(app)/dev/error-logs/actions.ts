"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDevUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { ERROR_STATUSES, type ErrorStatus } from "@/lib/errors/types";
import { toFailure } from "@/lib/errors/action";

// ---------------------------------------------------------------------------
// Triage actions for the Error Logs page.
//
// Every one of them starts with requireDevUser(). That is not belt-and-braces
// on top of the page guard — a server action is its own entry point, reachable
// by POST without ever rendering the page, so the page guard protects nothing
// here. The check has to be in each action.
// ---------------------------------------------------------------------------

function isStatus(v: string): v is ErrorStatus {
  return (ERROR_STATUSES as string[]).includes(v);
}

/** Move one error through triage, optionally leaving a note. */
export async function updateErrorStatus(formData: FormData) {
  const actor = await requireDevUser();
  const id = String(formData.get("id") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const notes = String(formData.get("resolution_notes") || "").trim();

  if (!id || !isStatus(status)) return { error: "Choose a status." };

  try {
    const resolving = status === "resolved";
    await getSupabase()
      .from("error_logs")
      .update({
        status,
        resolution_notes: notes || null,
        // Stamped only on the transition INTO resolved, so re-saving a note on
        // an already-resolved error does not keep moving the date.
        resolved_at: resolving ? new Date().toISOString() : null,
        resolved_by: resolving ? actor.id : null,
        resolved_by_name: resolving ? actor.full_name : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (err) {
    return toFailure(err, { subject: "error log", action: "updated" });
  }

  revalidatePath("/dev/error-logs");
  revalidatePath(`/dev/error-logs/${id}`);
  return { ok: true };
}

/** Bulk triage from the list — resolve or ignore a set of groups at once. */
export async function bulkUpdateStatus(formData: FormData) {
  await requireDevUser();
  const ids = formData.getAll("ids").map((v) => String(v)).filter(Boolean);
  const status = String(formData.get("status") || "").trim();
  if (ids.length === 0 || !isStatus(status)) redirect("/dev/error-logs");

  try {
    await getSupabase()
      .from("error_logs")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", ids);
  } catch {
    // Reported by the instrumented client; the page just reloads unchanged.
  }
  revalidatePath("/dev/error-logs");
  redirect("/dev/error-logs");
}

/**
 * Housekeeping: drop closed groups that have not been seen for a while. Kept as
 * an explicit button rather than a cron so nothing deletes itself unattended.
 */
export async function purgeOldErrors(formData: FormData) {
  await requireDevUser();
  const days = Math.max(1, Number(formData.get("days")) || 90);
  try {
    await getSupabase().rpc("purge_error_logs", { older_than_days: days });
  } catch {
    // Migration 0040 not applied, or the RPC is unavailable — nothing to do.
  }
  revalidatePath("/dev/error-logs");
  redirect("/dev/error-logs");
}
