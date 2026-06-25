import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { isSalesRole } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader, EmptyState } from "@/components/ui";
import { loadBookingFlow } from "../bookings/flow";
import AvailablePlotsBrowser from "./AvailablePlotsBrowser";

export const dynamic = "force-dynamic";

// Sales · Available Plots. Card view of projects that have available plots
// (the salesperson's home district first), drilling into available plots only.
export default async function AvailablePlotsPage() {
  const user = await requireUser();
  if (!isSalesRole(user.role)) redirect("/dashboard");
  await sweepExpiredBookings();
  const sb = getSupabase();

  // loadBookingFlow already returns only projects with AVAILABLE plots.
  const flow = await loadBookingFlow(sb, user);
  const { data: me } = await sb.from("users").select("district").eq("id", user.id).maybeSingle();
  const myDistrict = (me as { district?: string | null } | null)?.district ?? null;

  return (
    <>
      <PageHeader
        title="Available Plots"
        subtitle="Projects with available plots — your district first. Open a project to view and block its plots."
      />
      {!flow || flow.projects.length === 0 ? (
        <div className="card">
          <EmptyState message="No available plots right now." hint="Check back later as inventory frees up." />
        </div>
      ) : (
        <AvailablePlotsBrowser projects={flow.projects} myDistrict={myDistrict} />
      )}
    </>
  );
}
