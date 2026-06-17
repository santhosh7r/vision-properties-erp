import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Building, Grid, FileText, Check } from "@/components/icons";
import LoginForm from "./LoginForm";

const FEATURES = [
  { icon: Building, text: "Projects, plot categories & per-project policy" },
  { icon: Grid, text: "Live plot inventory across every project" },
  { icon: FileText, text: "Guided block / book flow with refunds & transfers" },
  { icon: Check, text: "Role-based access for your whole team" },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="force-light grid min-h-screen lg:grid-cols-2">
      {/* ── Left: brand hero ─────────────────────────────────────────────── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{
          background: "#428fdf",
          color: "#fff",
        }}
      >
        {/* decorative blobs + grid */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-black/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-4">
          <div
            className="flex items-center justify-center rounded-2xl px-5 py-4 shadow-lg"
            style={{ background: "#000000" }}
          >
            <img
              src="/logo-full.png"
              alt="Vision Properties"
              className="h-20 w-auto object-contain"
            />
          </div>
          <div className="border-l border-black/20 pl-4" style={{ color: "#000000" }}>
            <div className="text-lg font-semibold leading-tight">Vision Properties</div>
            <div className="text-sm opacity-80">Plot Management ERP System</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Run your entire plot business from one place.
          </h2>
          <p className="mt-3 text-sm text-white/80">
            Bookings, blocking, registrations, payments and your whole team — unified.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                  <f.icon size={16} />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} Vision Properties. All rights reserved.
        </p>
      </div>

      {/* ── Right: sign-in ───────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center overflow-hidden p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
        />

        <div className="relative w-full max-w-sm">
          {/* heading (+ mobile brand mark) */}
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <img
              src="/logo-full.png"
              alt="Vision Properties"
              className="mb-5 h-16 w-auto lg:hidden"
            />
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Sign in to your{" "}
              <span className="font-medium" style={{ color: "var(--brand-red)" }}>Vision</span>{" "}
              <span className="font-medium" style={{ color: "var(--accent)" }}>Properties</span>{" "}
              account.
            </p>
          </div>

          <div
            className="rounded-2xl border bg-[var(--surface)] p-7"
            style={{ borderColor: "var(--border)", boxShadow: "var(--shadow-lg)" }}
          >
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Trouble signing in? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
