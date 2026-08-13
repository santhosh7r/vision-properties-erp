import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope, withProjectScope } from "@/lib/scope";
import { PageHeader } from "@/components/ui";
import type { Plot, Project, Registration } from "@/lib/types";
import RegistrationsTable, { type RegistrationRow } from "./RegistrationsTable";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  // Registrations are handled by Admin, Legal and Post-Sales — sales roles can't
  // register. A Post-Sales desk sees its own district's registrations only.
  const user = await requireCapability("manage_registration");
  const sb = getSupabase();
  const scope = await getDistrictScope(sb, user);

  // Only actually-registered plots are listed here. Registering (or cancelling)
  // a plot is now driven from the Blockings & Bookings list / detail page.
  const { data: regData } = await withProjectScope(
    sb.from("registrations").select("*, plots(plot_no), projects(name)"),
    scope,
  ).order("register_date", { ascending: false });
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
