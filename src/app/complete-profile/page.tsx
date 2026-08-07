import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { registrationGaps, type RegistrationRow } from "@/lib/partner-registration";
import { requiresRegistration, ROLE_LABELS } from "@/lib/roles";
import { logout } from "@/app/login/actions";
import { SubmitButton } from "@/components/SubmitButton";
import CompleteProfileForm from "./CompleteProfileForm";

export const dynamic = "force-dynamic";

// Forced registration screen. Sales accounts created before the registration
// form existed (or by an import) reach the app with no date of birth, address,
// nominee or signed declaration on file. The app layout sends them here and
// nothing else is reachable until the form is submitted.
//
// Standalone — no sidebar, like /login and /change-password — so an account that
// has not completed registration never renders the app shell at all.
export default async function CompleteProfilePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  // Judge the REAL role: a dev switched into another role must not be handed
  // someone else's registration form to fill in against their own row.
  if (!requiresRegistration(user.realRole)) redirect("/dashboard");

  const { data } = await getSupabase()
    .from("users")
    .select(
      "full_name, mobile, whatsapp, date_of_birth, address, district, occupation, rera_number, nominee_name, nominee_mobile, declared_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const gaps = registrationGaps(data as RegistrationRow | null);
  // Nothing outstanding — don't strand a complete account on a form it cannot
  // meaningfully submit.
  if (gaps.length === 0) redirect("/dashboard");

  const row = (data ?? {}) as Record<string, string | null>;

  return (
    <div className="force-light relative min-h-screen overflow-x-hidden p-6">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />
      <div className="relative mx-auto w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-full.png" alt="Vision Properties" className="mb-5 h-16 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Complete your registration</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {user.full_name} · {ROLE_LABELS[user.realRole]}
          </p>
        </div>

        <div className="rounded-2xl border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
            Your account is missing {gaps.length} required{" "}
            {gaps.length === 1 ? "detail" : "details"}: {gaps.join(", ")}. Fill in the registration
            form below to continue — the app is unavailable until it is complete.
          </div>

          <CompleteProfileForm
            defaults={{
              full_name: row.full_name ?? user.full_name,
              mobile: row.mobile,
              whatsapp: row.whatsapp,
              date_of_birth: row.date_of_birth,
              address: row.address,
              district: row.district,
              occupation: row.occupation,
              rera_number: row.rera_number,
              nominee_name: row.nominee_name,
              nominee_mobile: row.nominee_mobile,
            }}
          />
        </div>

        <form action={logout} className="mt-4 text-center">
          <SubmitButton className="text-xs text-[var(--muted)] underline" pendingLabel="Signing out…">
            Sign out instead
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
