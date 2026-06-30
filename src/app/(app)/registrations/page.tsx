import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project, Registration } from "@/lib/types";
import RegistrationsTable, { type RegistrationRow } from "./RegistrationsTable";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  // Registrations are handled by Admin + Legal only — sales roles can't register.
  const user = await requireCapability("manage_registration");
  const sb = getSupabase();

  const { data: regData } = await sb
    .from("registrations")
    .select("*, plots(plot_no), projects(name)")
    .order("register_date", { ascending: false });
  const raw = (regData ?? []) as (Registration & {
    plots: Pick<Plot, "plot_no">;
    projects: Pick<Project, "name">;
  })[];
  const rows: RegistrationRow[] = raw.map((r) => ({
    id: r.id,
    project: r.projects?.name ?? "—",
    plot: r.plots ? r.plots.plot_no : "—",
    register_number: r.register_number,
    register_date: r.register_date,
    registrant: r.name_of_registrant,
    mobile: r.mobile ?? "",
  }));

  // Any active booking/blocking the admin can still turn into a registration —
  // confirming first is not required. Already-registered bookings are excluded.
  const registeredBookingIds = new Set(
    raw.map((r) => r.booking_id).filter(Boolean) as string[],
  );
  const { data: pendingReg } = await sb
    .from("bookings")
    .select("id, plots(plot_no), customers(name), projects(name)")
    .neq("status", "cancelled");
  const awaiting = ((pendingReg ?? []) as unknown as (Pick<Booking, "id"> & {
    plots: Pick<Plot, "plot_no">;
    customers: Pick<Customer, "name">;
    projects: Pick<Project, "name">;
  })[]).filter((b) => b && !registeredBookingIds.has(b.id));

  const canRegister = can(user.role, "manage_registration");

  return (
    <>
      <PageHeader
        title="Registrations"
        subtitle="Completed registrations and confirmed bookings awaiting registration."
      />

      {canRegister && awaiting.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-3 text-sm font-semibold">Awaiting Registration ({awaiting.length})</h2>
          <div className="flex flex-wrap gap-2">
            {awaiting.map((b) => (
              <Link key={b.id} href={`/registrations/new?booking=${b.id}`} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
                {b.projects?.name} · {b.plots?.plot_no} · {b.customers?.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <RegistrationsTable rows={rows} />
    </>
  );
}
