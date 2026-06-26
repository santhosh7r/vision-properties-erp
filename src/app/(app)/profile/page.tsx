import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDownlineIds } from "@/lib/hierarchy";
import { getDistrictNames } from "@/lib/districts";
import { isSalesRole, ROLE_LABELS, type Role } from "@/lib/roles";
import { COUPON_TYPES, isValueCoupon } from "@/lib/options";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CreditCard, Cog, Grid, Sparkle } from "@/components/icons";
import type { User } from "@/lib/types";
import ProfileEditor from "./ProfileEditor";
import ThemePref from "../settings/ThemePref";
import { changePassword, signOutEverywhere } from "../settings/actions";

export const dynamic = "force-dynamic";

// Modern token-card meta — an icon chip + accent per coupon type.
const TOKEN_META: Record<string, { icon: React.ReactNode; color: string }> = {
  cab: { icon: <CreditCard size={18} />, color: "#e4433a" },
  tools: { icon: <Cog size={18} />, color: "#428fdf" },
  digital: { icon: <Grid size={18} />, color: "#8b5cf6" },
  gold: { icon: <Sparkle size={18} />, color: "#f59e0b" },
};

const ERRORS: Record<string, string> = {
  profile: "Name and email are required.",
  email: "Another user already uses that email.",
  missing: "Please fill in all password fields.",
  short: "New password must be at least 6 characters.",
  mismatch: "New password and confirmation don’t match.",
  wrong: "Your current password is incorrect.",
};
const OKS: Record<string, string> = {
  "1": "Profile updated.",
  password: "Password updated.",
  prefs: "Preferences saved.",
};

// Sales · My Profile — edit your details and view your token / coupon balances.
// Car-coupon (cab token) by role: Senior Director unlimited; Director 3 per
// booking/blocking held > 48h; Business Manager / Partner none (other tokens still apply).
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireUser();
  if (!isSalesRole(user.role)) redirect("/dashboard");
  const { err, ok } = await searchParams;
  const sb = getSupabase();

  const { data: meData } = await sb.from("users").select("*").eq("id", user.id).maybeSingle();
  const me = (meData ?? null) as User | null;

  let managerName: string | null = null;
  if (me?.manager_id) {
    const { data: mgr } = await sb.from("users").select("full_name").eq("id", me.manager_id).maybeSingle();
    managerName = (mgr as { full_name?: string } | null)?.full_name ?? null;
  }

  // Team size = everyone in their downline (excluding themselves).
  const downline = await getDownlineIds(sb, user.id);
  const teamCount = Math.max(0, downline.length - 1);

  // Districts come from the admin-managed master list (migration 0014).
  const districts = await getDistrictNames(sb);

  // Coupon balances (graceful if coupons table isn't migrated yet). Value-based
  // coupons (tools) sum their ₹ value; the rest count whole tokens.
  const { data: couponData } = await sb.from("coupons").select("type, quantity, value").eq("user_id", user.id);
  const balances: Record<string, number> = {};
  for (const c of (couponData ?? []) as { type: string; quantity: number; value: number }[]) {
    balances[c.type] = (balances[c.type] ?? 0) + (isValueCoupon(c.type) ? Number(c.value || 0) : Number(c.quantity || 0));
  }

  const isDirector = user.role === "director";
  // Car coupon shown only for Director (their finite 48h balance). Senior
  // Director's allowance is unlimited so there's nothing to display; Business
  // Manager / Partner don't get car coupons at all.
  const showCarCoupon = isDirector;
  const noCarRole = user.role === "business_manager" || user.role === "business_partner";
  const otherTokens = COUPON_TYPES.filter((t) => t.value !== "cab");

  return (
    <>
      <PageHeader title="My Profile" subtitle={ROLE_LABELS[user.role as Role]} />

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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details — read-only until "Edit". Flex column so the card fills the
            full row height (matching the tall right column). */}
        <div className="flex flex-col lg:col-span-1">
          <ProfileEditor
            data={{
              full_name: me?.full_name ?? user.full_name,
              email: me?.email ?? user.email,
              mobile: me?.mobile ?? "",
              district: (me as { district?: string | null } | null)?.district ?? "",
              role: user.role as Role,
              code: me?.partner_code ?? null,
              managerName,
              teamCount,
            }}
            districts={districts}
          />
        </div>

        {/* Tokens & coupons */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <h2 className="mb-1 text-sm font-semibold">My Tokens &amp; Coupons</h2>
            <p className="mb-4 text-xs text-[var(--muted)]">
              Tokens and coupons issued to you.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {showCarCoupon && (
                <TokenCard
                  label="Car Coupon (Cab Token)"
                  value={String(balances.cab ?? 0)}
                  note="3 per booking / blocking held over 48 hrs"
                  icon={TOKEN_META.cab.icon}
                  color={TOKEN_META.cab.color}
                  highlight
                />
              )}
              {otherTokens.map((t) => (
                <TokenCard
                  key={t.value}
                  label={t.label}
                  value={isValueCoupon(t.value) ? inr(balances[t.value] ?? 0) : String(balances[t.value] ?? 0)}
                  note="Issued on registrations"
                  icon={TOKEN_META[t.value]?.icon}
                  color={TOKEN_META[t.value]?.color ?? "#428fdf"}
                />
              ))}
            </div>
            {noCarRole && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Car coupons aren&apos;t issued to your role — the other tokens above still apply.
              </p>
            )}
          </div>

          {/* Account settings */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-4 text-sm font-semibold">Change Password</h2>
              <form action={changePassword} className="space-y-3">
                <input type="hidden" name="redirect_to" value="/profile" />
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

            <div className="card">
              <h2 className="mb-1 text-sm font-semibold">Appearance</h2>
              <p className="mb-3 text-xs text-[var(--muted)]">How the app looks on this device.</p>
              <ThemePref />
            </div>
          </div>

          {/* Security */}
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Sign out everywhere</div>
              <p className="text-xs text-[var(--muted)]">Sign out of all devices. You&apos;ll need to sign in again.</p>
            </div>
            <form action={signOutEverywhere}>
              <SubmitButton className="btn-ghost text-[var(--brand-red)]" pendingLabel="Signing out…">
                Sign out everywhere
              </SubmitButton>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function TokenCard({
  label,
  value,
  note,
  icon,
  color = "#428fdf",
  highlight = false,
}: {
  label: string;
  value: string;
  note: string;
  icon?: React.ReactNode;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-4 transition hover:-translate-y-0.5"
      style={{ borderColor: highlight ? color : "var(--border)", background: "var(--surface-2)" }}
    >
      {icon && (
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${color}1f`, color }}
        >
          {icon}
        </span>
      )}
      <div className="mt-3 text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums" style={{ color: highlight ? color : undefined }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--muted)]">{note}</div>
    </div>
  );
}
