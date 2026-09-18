import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Icons } from "@/components/icons";
import { can, type Role } from "@/lib/roles";
import { HIDDEN_IN_LIST } from "@/lib/hidden-users";
import { ResetPasswordPanel, type ResetTarget } from "../users/ResetPassword";
import PasswordResets, { type ResetLogRow } from "./PasswordResets";
import { changePassword, updateProfile } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  missing: "Please fill in all required fields.",
  short: "New password must be at least 6 characters.",
  mismatch: "New password and confirmation don’t match.",
  wrong: "Your current password is incorrect.",
  profile: "Name and email are required.",
  email: "Another user already uses that email.",
};
const OKS: Record<string, string> = {
  password: "Password updated.",
  profile: "Profile updated.",
};

// Which feedback keys belong to the PASSWORD tab. changePassword redirects back
// to plain /settings (its `redirect_to` is a bare path — appending ?tab= there
// would produce a second '?'), so the tab is re-derived from the outcome instead:
// a password result must land on the tab the form lives on, not back on Account.
const PASSWORD_KEYS = new Set(["missing", "short", "mismatch", "wrong", "password"]);

const CONTROLS: { href: string; label: string; desc: string; icon: keyof typeof Icons }[] = [
  { href: "/users", label: "Users & Hierarchy", desc: "Create team members, set roles & reporting", icon: "users" },
  { href: "/projects", label: "Projects", desc: "Projects, policy config & plot categories", icon: "building" },
  { href: "/plots", label: "Plot Inventory", desc: "Every plot across all projects", icon: "grid" },
  { href: "/bookings", label: "Bookings & Blocking", desc: "Block / book plots, confirm, cancel & refunds", icon: "fileText" },
  { href: "/customers", label: "Customers", desc: "Customer profiles & plot booking history", icon: "userCircle" },
  { href: "/payments", label: "Payments", desc: "Record and review all payments", icon: "creditCard" },
  { href: "/registrations", label: "Registrations", desc: "Plot registrations", icon: "scroll" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; tab?: string }>;
}) {
  const user = await requireCapability("manage_users");
  const isAdmin = true;
  const { err, ok, tab: tabParam } = await searchParams;

  const sb = getSupabase();
  // Resetting SOMEONE ELSE's password is Admin-only — `reset_password` is the one
  // capability a General Manager does not inherit (see lib/roles.ts). Changing
  // your OWN password is not gated: everyone on this page gets that.
  const canReset = can(user.role as Role, "reset_password");

  // Everything password-related lives on one tab, including the signed-in user's
  // own change — so the Password tab exists for everybody, and only the two
  // admin-only panels inside it are gated.
  const tab: "account" | "password" =
    tabParam === "password" || PASSWORD_KEYS.has(err ?? "") || PASSWORD_KEYS.has(ok ?? "")
      ? "password"
      : "account";

  const [{ data }, { data: staff }] = await Promise.all([
    sb.from("users").select("full_name, email, mobile").eq("id", user.id).maybeSingle(),
    // Only fetched when the Password tab will actually render it.
    canReset && tab === "password"
      ? sb
          .from("users")
          .select("id, full_name, role, partner_code")
          // Admins are excluded because the action refuses them anyway (an Admin
          // changes their own password in the card above), and hidden dev logins
          // never appear in any panel.
          .neq("role", "admin")
          .not("email", "in", HIDDEN_IN_LIST)
          .order("full_name")
      : Promise.resolve({ data: [] }),
  ]);

  const me = (data ?? { full_name: user.full_name, email: user.email, mobile: "" }) as {
    full_name: string;
    email: string;
    mobile: string | null;
  };

  const resetTargets: ResetTarget[] = ((staff ?? []) as {
    id: string;
    full_name: string;
    role: Role;
    partner_code: string | null;
  }[]).map((u) => ({ id: u.id, full_name: u.full_name, role: u.role, code: u.partner_code }));

  const resetLog = canReset && tab === "password" ? await loadResetLog(sb) : [];

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          isAdmin
            ? "Admin control center — manage your account and jump into every part of the app."
            : "Manage your account."
        }
      />

      {err && ERRORS[err] && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {ERRORS[err]}
        </div>
      )}
      {ok && OKS[ok] && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
          {OKS[ok]}
        </div>
      )}

      <div className="mb-6 flex gap-2 border-b border-[var(--border)]">
        <TabLink href="/settings" label="Account" active={tab === "account"} />
        <TabLink href="/settings?tab=password" label="Password" active={tab === "password"} />
      </div>

      {tab === "password" ? (
        <div className="space-y-6">
          {/* 1 · My own password. Requires the current one — that is the proof
              of identity, and the reset tools below deliberately cannot skip it
              for your own account. */}
          <div className="card max-w-xl">
            <h2 className="text-sm font-semibold">My Password</h2>
            <p className="mb-4 mt-1 text-xs text-[var(--muted)]">
              Changing your own password. Your current one is required.
            </p>
            <form action={changePassword} className="space-y-3">
              <div>
                <label className="label">Current Password *</label>
                <input name="current_password" type="password" autoComplete="current-password" className="input" required />
              </div>
              <div>
                <label className="label">New Password *</label>
                <input name="new_password" type="password" autoComplete="new-password" className="input" required />
              </div>
              <div>
                <label className="label">Confirm New Password *</label>
                <input name="confirm_password" type="password" autoComplete="new-password" className="input" required />
              </div>
              <SubmitButton pendingLabel="Updating…">Update Password</SubmitButton>
            </form>
          </div>

          {/* 2 · Reset someone else's. Admin only. The same control sits on each
              row of Business Partners › Block / Change Team & Level; this one
              starts from a search, for when they ring up locked out. */}
          {canReset && (
            <div className="card">
              <h2 className="text-sm font-semibold">Reset a Team Member&apos;s Password</h2>
              <p className="mb-4 mt-1 text-xs text-[var(--muted)]">
                For partners, their whole downline, and the in-house desks — anyone who is locked
                out. Also available per row under Business Partners › Block / Change Team &amp;
                Level.
              </p>
              <ResetPasswordPanel users={resetTargets} />
            </div>
          )}

          {/* 3 · The history of every reset. */}
          {canReset && (
            <div className="card">
              <h2 className="text-sm font-semibold">Reset History</h2>
              <p className="mb-4 mt-1 text-xs text-[var(--muted)]">
                Every password reset, and who is still waiting to be handed theirs.
              </p>
              <PasswordResets rows={resetLog} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* My Profile — admins edit it here; sales edit it on the Profile page. */}
          {isAdmin && (
            <div className="card max-w-xl">
              <h2 className="mb-4 text-sm font-semibold">My Profile</h2>
              <form action={updateProfile} className="space-y-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input name="full_name" className="input" defaultValue={me.full_name} required />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input name="email" type="email" className="input" defaultValue={me.email} required />
                </div>
                <div>
                  <label className="label">Mobile</label>
                  <input name="mobile" className="input" defaultValue={me.mobile ?? ""} />
                </div>
                <SubmitButton pendingLabel="Saving…">Save Profile</SubmitButton>
              </form>
            </div>
          )}

          {/* Control center — admin only */}
          {isAdmin && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold">Control Center</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CONTROLS.map((c) => {
                  const Icon = Icons[c.icon];
                  return (
                    <Link key={c.href} href={c.href} className="card transition hover:border-[var(--accent)]">
                      <div className="flex items-center gap-3">
                        <span className="text-[var(--accent)]"><Icon size={20} /></span>
                        <span className="font-medium">{c.label}</span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--muted)]">{c.desc}</p>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

// Reset history, read from the audit log — the resets themselves are what is
// recorded, never the passwords they produced (see PasswordResets).
async function loadResetLog(sb: ReturnType<typeof getSupabase>): Promise<ResetLogRow[]> {
  const { data: log } = await sb
    .from("audit_log")
    .select("id, actor_name, entity_id, created_at")
    .eq("entity", "user")
    .eq("action", "password_reset")
    .order("created_at", { ascending: false })
    .limit(200);
  const entries = (log ?? []) as {
    id: string;
    actor_name: string | null;
    entity_id: string | null;
    created_at: string;
  }[];
  if (!entries.length) return [];

  // Resolve every reset's target in ONE query rather than per row. `settings`
  // carries must_change_password, which is how we know the temporary password
  // has not been used yet.
  const ids = [...new Set(entries.map((e) => e.entity_id).filter(Boolean))] as string[];
  const { data: targets } = ids.length
    ? await sb.from("users").select("id, full_name, role, partner_code, settings").in("id", ids)
    : { data: [] };
  const byId = new Map(
    ((targets ?? []) as {
      id: string;
      full_name: string;
      role: Role;
      partner_code: string | null;
      settings: { must_change_password?: boolean } | null;
    }[]).map((u) => [u.id, u]),
  );

  return entries.map((e) => {
    const t = e.entity_id ? byId.get(e.entity_id) : undefined;
    return {
      id: e.id,
      userId: t?.id ?? null,
      // A deleted account keeps its audit trail; say so rather than show a blank.
      name: t?.full_name ?? "(account removed)",
      role: t?.role ?? null,
      code: t?.partner_code ?? null,
      resetAt: e.created_at,
      resetBy: e.actor_name ?? "—",
      pending: t?.settings?.must_change_password === true,
    };
  });
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-[var(--accent)] text-[var(--text)]"
          : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </Link>
  );
}
