import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { Icons } from "@/components/icons";
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
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const user = await requireCapability("manage_users");
  const isAdmin = true;
  const { err, ok } = await searchParams;

  const { data } = await getSupabase()
    .from("users")
    .select("full_name, email, mobile")
    .eq("id", user.id)
    .maybeSingle();
  const me = (data ?? { full_name: user.full_name, email: user.email, mobile: "" }) as {
    full_name: string;
    email: string;
    mobile: string | null;
  };

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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Profile — admins edit it here; sales edit it on the Profile page. */}
        {isAdmin && (
          <div className="card">
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

        {/* Change Password */}
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Change Password</h2>
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
      </div>

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
  );
}
