import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { Plus } from "@/components/icons";
import type { Project } from "@/lib/types";
import ProjectsTable, { type ProjectRow } from "./ProjectsTable";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requireUser();
  // Admin uses the dedicated card-based Inventory workspace, not this shared
  // table. Keep the route working for non-admin roles only.
  if (user.role === "admin") redirect("/inventory/manage");
  const sb = getSupabase();
  const { data } = await sb
    .from("projects")
    .select("*, plots(status)")
    .order("created_at", { ascending: false });

  const raw = (data ?? []) as (Project & {
    plots: { status: string }[];
  })[];

  const rows: ProjectRow[] = raw.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    district: p.district,
    area: p.area,
    approval_type: p.approval_type,
    project_type: p.project_type,
    status: p.status,
    // Sales only see AVAILABLE inventory — booked, blocked and cancelled
    // (reserved until an admin releases) plots don't count here.
    plots: (p.plots ?? []).filter((pl) => pl.status === "available").length,
    advance_percent: p.advance_percent,
  }));

  // Surface the salesperson's home city FIRST (e.g. a Chennai partner sees
  // Chennai projects at the top).
  const { data: me } = await sb.from("users").select("city").eq("id", user.id).maybeSingle();
  const myCity = ((me as { city?: string | null } | null)?.city ?? "").trim().toLowerCase();
  if (myCity) {
    rows.sort((a, b) => (a.city.toLowerCase() === myCity ? 0 : 1) - (b.city.toLowerCase() === myCity ? 0 : 1));
  }

  const editable = can(user.role, "manage_projects");

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every development across the portfolio. Search, filter and drill in."
        action={
          editable ? (
            <Link href="/projects/new" className="btn-primary">
              <Plus size={16} /> New Project
            </Link>
          ) : undefined
        }
      />
      <ProjectsTable rows={rows} editable={editable} />
    </>
  );
}
