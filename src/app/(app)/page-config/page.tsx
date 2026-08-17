import { requireCapability } from "@/lib/auth";
import { loadRoleAccess, levelsForRole } from "@/lib/access";
import { CONFIGURABLE_PAGES, CONFIGURABLE_ROLES, defaultLevel, type PageLevel } from "@/lib/pages";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import RoleAccessEditor, { type RoleCard } from "./RoleAccessEditor";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, { tone: "ok" | "err"; text: string }> = {
  "1": { tone: "ok", text: "Access saved. The sidebar and page guards use it immediately." },
  reset: { tone: "ok", text: "Role put back on the built-in defaults." },
  role: { tone: "err", text: "That role can't be edited." },
  not_migrated: {
    tone: "err",
    text: "Nothing was saved: migration 0034_page_config.sql has not been applied yet. Run it, then save again.",
  },
};

// Administration › Page Config — ADMIN ONLY. Which pages each role can reach, and
// at what level. Everything here layers OVER the built-in defaults (taken from
// the menu), so an untouched role behaves exactly as it always has.
export default async function PageConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; role?: string }>;
}) {
  await requireCapability("manage_users");
  const { ok, err } = await searchParams;
  const notice = NOTICE[ok ?? ""] ?? NOTICE[err ?? ""];

  const access = await loadRoleAccess();

  const roles: RoleCard[] = CONFIGURABLE_ROLES.map((role) => {
    const levels = levelsForRole(access, role);
    return {
      role,
      label: ROLE_LABELS[role],
      canLogin: !access.loginBlocked.has(role),
      // Has an Admin actually saved anything for this role, or is it still on the
      // defaults? Worth showing — it explains why a role changes behaviour when
      // the menu changes (defaults follow the menu; saved rows do not).
      customised: CONFIGURABLE_PAGES.some((p) => access.overrides.has(`${role}:${p.key}`)),
      pages: CONFIGURABLE_PAGES.map((p) => ({
        key: p.key,
        label: p.label,
        group: p.group,
        level: (levels.get(p.key) ?? "none") as PageLevel,
        defaultLevel: defaultLevel(role, p.key),
      })),
    };
  });

  return (
    <>
      <PageHeader
        title="Page Config"
        subtitle="Which pages each role can open, and whether they can only look or also act. Admin always has everything."
      />

      {notice && (
        <div
          className="mb-4 rounded-lg px-4 py-2.5 text-sm"
          style={{
            background: notice.tone === "ok" ? "var(--green-soft, #ecfdf5)" : "var(--red-soft, #fef2f2)",
            color: notice.tone === "ok" ? "var(--green, #047857)" : "var(--brand-red, #b91c1c)",
          }}
        >
          {notice.text}
        </div>
      )}

      {!access.configured && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <p className="font-medium">Not stored yet — migration pending.</p>
          <p className="mt-1">
            <b>0034_page_config.sql</b> has not been applied, so this grid is showing the built-in defaults and saving
            will fail. The app is unaffected until then; it simply keeps using those defaults. Run the migration to make
            this editable.
          </p>
        </div>
      )}

      <div
        className="mb-6 rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <p className="font-medium text-[var(--text)]">Admin access is mandatory and locked</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Every page is always enabled for Admin and this cannot be edited by anyone — otherwise the account that
          configures access could lock itself out. Ticking a page lets the role open it; ticking <b>Edit</b> as well
          lets them change things on it. Role-level rules still apply on top — confirming a booking and releasing a
          plot stay Admin-only whatever is set here.
        </p>
      </div>

      <RoleAccessEditor roles={roles} />
    </>
  );
}
