import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import type { Plot, Project, Registration } from "@/lib/types";
import RegistrationsTable, { type RegistrationRow } from "./RegistrationsTable";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  // Registrations are handled by Admin + Legal only — sales roles can't register.
  await requireCapability("manage_registration");
  const sb = getSupabase();

  // Only actually-registered plots are listed here. Registering (or cancelling)
  // a plot is now driven from the Blockings & Bookings list / detail page.
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
    bookingId: r.booking_id ?? null,
    project: r.projects?.name ?? "—",
    plot: r.plots ? r.plots.plot_no : "—",
    register_number: r.register_number,
    register_date: r.register_date,
    registrant: r.name_of_registrant,
    mobile: r.mobile ?? "",
  }));

  return (
    <>
      <PageHeader
        title="Registrations"
        subtitle="Registered plots. Register or cancel a plot from Blockings & Bookings."
      />
      <RegistrationsTable rows={rows} />
    </>
  );
}
