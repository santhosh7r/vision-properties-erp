import { redirect } from "next/navigation";
import { getSession, mustChangePassword } from "@/lib/session";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  missing: "Please enter a new password.",
  short: "Password must be at least 8 characters.",
  mismatch: "The two passwords do not match.",
};

// Forced password-change screen. Reached when a user's account is flagged
// (settings.must_change_password) — the app layout redirects here until they
// set a new password. Standalone (no sidebar), like /login.
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  // Only the forced flow lives here; if the flag isn't set, there's nothing to do.
  if (!(await mustChangePassword(user.id))) redirect("/dashboard");

  const { err } = await searchParams;

  return (
    <div className="force-light relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo-full.png" alt="Vision Properties" className="mb-5 h-16 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            For security, you must choose your own password before continuing.
          </p>
        </div>

        <div
          className="rounded-2xl border bg-[var(--surface)] p-7"
          style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
        >
          <ChangePasswordForm error={err ? ERRORS[err] ?? "Please try again." : null} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Signed in as {user.email}.
        </p>
      </div>
    </div>
  );
}
