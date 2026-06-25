import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import StartBookingFlow from "../StartBookingFlow";
import { loadBookingFlow } from "../flow";

export const dynamic = "force-dynamic";

// Add Blocking & Booking — the create flow only (project → plot → block/book).
// The list of existing records lives at /bookings.
export default async function AddBookingPage() {
  const user = await requireUser();
  const canBlock = can(user.role, "create_blocking");
  const canBook = can(user.role, "create_booking");
  if (!canBlock && !canBook) redirect("/bookings");
  await sweepExpiredBookings();
  const sb = getSupabase();
  const flow = await loadBookingFlow(sb, user);
  const { data: me } = await sb.from("users").select("city").eq("id", user.id).maybeSingle();
  const myCity = (me as { city?: string | null } | null)?.city ?? null;

  return (
    <>
      <PageHeader
        title="Add Blocking & Booking"
        subtitle="Pick a project and an available plot, then block or book it."
        back={{ href: "/bookings", label: "← Blockings & Bookings" }}
      />
      {!flow || flow.projects.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-12 text-center text-sm text-[var(--muted)]"
          style={{ borderColor: "var(--border-strong)" }}
        >
          No available plots to block or book. Add plots to an active project first.
        </div>
      ) : (
        <StartBookingFlow
          projects={flow.projects}
          customers={flow.customers}
          canBlock={canBlock}
          canBook={canBook}
          myCity={myCity}
        />
      )}
    </>
  );
}
