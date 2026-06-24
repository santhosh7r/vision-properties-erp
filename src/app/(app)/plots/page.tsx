import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { sweepExpiredBookings } from "@/lib/lifecycle";
import { PageHeader } from "@/components/ui";
import type { Plot, Project } from "@/lib/types";
import PlotsTable, { type PlotRow } from "./PlotsTable";

export const dynamic = "force-dynamic";

export default async function PlotsPage() {
  const user = await requireUser();
  // Admin uses the card-based Inventory workspace instead of this shared table.
  if (user.role === "admin") redirect("/inventory/manage");
  await sweepExpiredBookings();

  const sb = getSupabase();
  // Admin / inventory managers see every plot in every status. Sales users see
  // only what they can act on — available plots.
  const seesAllPlots = can(user.role, "manage_plots");
  let query = sb
    .from("plots")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });
  if (!seesAllPlots) query = query.eq("status", "available");
  const { data } = await query;
  const raw = (data ?? []) as (Plot & { projects: Pick<Project, "name"> })[];

  const rows: PlotRow[] = raw.map((p) => ({
    id: p.id,
    project: p.projects?.name ?? "—",
    plot_no: p.plot_no,
    sqft: p.sqft,
    value: p.sqft * p.price_per_sqft,
    status: p.status,
  }));

  return (
    <>
      <PageHeader
        title="Plot Inventory"
        subtitle={
          seesAllPlots
            ? "Every plot across all projects. Search, filter by status and sort instantly."
            : "Available plots across all projects — ready to block or book."
        }
      />
      <PlotsTable rows={rows} />
    </>
  );
}
