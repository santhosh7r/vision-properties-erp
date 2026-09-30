import { requirePage } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getCabQueue, watchesCabQueue } from "@/lib/cab-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by CabRequestNotifier (the sidebar count + the new-request pop-up).
// A route handler is outside the app layout, so Page Config is checked here:
// whoever may not open Approvals gets nothing from it either.
export async function GET(): Promise<Response> {
  const { user } = await requirePage("requests");
  if (!watchesCabQueue(user.role)) return json({ error: "forbidden" }, 403);
  try {
    const q = await getCabQueue(getSupabase(), user);
    return json({ awaitingYou: q.awaitingYou, awaitingSenior: q.awaitingSenior.length });
  } catch {
    // The notifier keeps its last known state and tries again next poll.
    return json({ error: "unavailable" }, 503);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private" },
  });
}
