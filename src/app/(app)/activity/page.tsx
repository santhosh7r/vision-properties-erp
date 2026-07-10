import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { HIDDEN_IN_LIST } from "@/lib/hidden-users";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import {
  Building,
  Grid,
  FileText,
  CreditCard,
  Scroll,
  UserCircle,
  Layers,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// Entity types written by logAudit across the app.
const ENTITIES = [
  "project",
  "plot",
  "plot_category",
  "booking",
  "payment",
  "registration",
  "request",
  "customer",
  "coupon",
  "user",
] as const;

const ENTITY_ICON: Record<string, React.ReactNode> = {
  project: <Building size={14} />,
  plot: <Grid size={14} />,
  plot_category: <Layers size={14} />,
  booking: <FileText size={14} />,
  payment: <CreditCard size={14} />,
  registration: <Scroll size={14} />,
  request: <FileText size={14} />,
  customer: <UserCircle size={14} />,
  coupon: <CreditCard size={14} />,
  user: <UserCircle size={14} />,
};

// A coarse colour cue by the kind of action, so destructive vs creative events
// are scannable at a glance.
function actionTone(action: string): "green" | "blue" | "amber" | "red" | "gray" | "purple" {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("cancel") || a.includes("reject") || a.includes("block"))
    return "red";
  if (a.includes("create") || a.includes("book") || a.includes("register") || a.includes("add"))
    return "green";
  if (a.includes("confirm") || a.includes("approve") || a.includes("complete")) return "blue";
  if (a.includes("update") || a.includes("change") || a.includes("edit") || a.includes("price"))
    return "amber";
  if (a.includes("login") || a.includes("logout")) return "purple";
  return "gray";
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; actor?: string; page?: string }>;
}) {
  // Admin-only — this capability is granted to the admin role only.
  await requireCapability("manage_users");
  const sb = getSupabase();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const entity = ENTITIES.includes((sp.entity ?? "") as (typeof ENTITIES)[number])
    ? (sp.entity as string)
    : "";
  const actor = (sp.actor ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Actor list for the filter dropdown (everyone who can appear as an actor).
  const { data: userRows } = await sb
    .from("users")
    .select("id, full_name")
    .not("email", "in", HIDDEN_IN_LIST) // hidden dev/support accounts never appear
    .order("full_name");
  const users = (userRows ?? []) as { id: string; full_name: string }[];

  let query = sb
    .from("audit_log")
    .select("id, actor_id, actor_name, entity, entity_id, action, details, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (entity) query = query.eq("entity", entity);
  if (actor) query = query.eq("actor_id", actor);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `actor_name.ilike.${like},action.ilike.${like},entity.ilike.${like},details.ilike.${like}`,
    );
  }

  const { data, count } = await query.range(from, to);
  const rows = (data ?? []) as AuditRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserve active filters across pagination links.
  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (entity) p.set("entity", entity);
    if (actor) p.set("actor", actor);
    for (const [k, v] of Object.entries(overrides)) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const hasFilters = Boolean(q || entity || actor);

  return (
    <>
      <PageHeader
        title="Activity Logs"
        subtitle="Every action taken by every user across the system."
      />

      {/* Filters */}
      <form method="GET" className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <label className="label">Search</label>
          <input
            name="q"
            defaultValue={q}
            className="input"
            placeholder="Name, action, entity or details…"
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="label">Person</label>
          <select name="actor" defaultValue={actor} className="select">
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label className="label">Type</label>
          <select name="entity" defaultValue={entity} className="select">
            <option value="">All types</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Filter
        </button>
        {hasFilters && (
          <Link href="/activity" className="btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-2 text-xs text-[var(--muted)]">
        {total.toLocaleString("en-IN")} {total === 1 ? "entry" : "entries"}
        {hasFilters ? " (filtered)" : ""}
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            message="No activity found."
            hint={hasFilters ? "Try clearing the filters." : undefined}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Who</th>
                  <th className="th">Action</th>
                  <th className="th">Type</th>
                  <th className="th">Details</th>
                  <th className="th whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.actor_name ?? "System"}</td>
                    <td className="td">
                      <Badge tone={actionTone(r.action)}>{r.action.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="td">
                      <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                        {ENTITY_ICON[r.entity] ?? <FileText size={14} />}
                        <span className="capitalize">{r.entity.replace(/_/g, " ")}</span>
                      </span>
                    </td>
                    <td className="td text-[var(--muted)]">{r.details || "—"}</td>
                    <td className="td whitespace-nowrap text-[var(--muted)]" title={fmtDateTime(r.created_at)}>
                      {timeAgo(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`/activity${qs({ page: page - 1 })}`} className="btn-ghost">
                ← Prev
              </Link>
            ) : (
              <span className="btn-ghost pointer-events-none opacity-40">← Prev</span>
            )}
            {page < totalPages ? (
              <Link href={`/activity${qs({ page: page + 1 })}`} className="btn-ghost">
                Next →
              </Link>
            ) : (
              <span className="btn-ghost pointer-events-none opacity-40">Next →</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
