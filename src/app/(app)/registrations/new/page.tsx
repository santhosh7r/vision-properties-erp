import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";
import PaymentModeFields from "../../bookings/PaymentModeFields";
import { createRegistration } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  await requireCapability("manage_registration");
  const sp = await searchParams;
  const bookingId = sp.booking;
  if (!bookingId) redirect("/registrations");

  const sb = getSupabase();
  const { data } = await sb
    .from("bookings")
    .select("*, plots(*), customers(name, mobile), projects(name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & {
    plots: Plot;
    customers: Pick<Customer, "name" | "mobile">;
    projects: Pick<Project, "name">;
  };

  const today = new Date().toISOString().slice(0, 10);
  const balance = Math.max(0, (b.total_plot_value ?? 0) - (b.advance_paid ?? 0));

  return (
    <>
      <PageHeader
        title="Register Plot"
        subtitle={`${b.projects.name} · Plot ${b.plots.plot_no}`}
        back={{ href: `/bookings/${b.id}`, label: "← Back" }}
      />

      <form action={createRegistration} className="max-w-2xl space-y-6">
        <input type="hidden" name="booking_id" value={b.id} />
        <input type="hidden" name="plot_id" value={b.plot_id} />
        <input type="hidden" name="project_id" value={b.project_id} />
        <input type="hidden" name="plot_sqft" value={b.plots.sqft} />

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Registration Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Readonly label="1. Project Name" value={b.projects.name} />
            <Readonly label="2. Plot No — Sq.ft" value={`${b.plots.plot_no} — ${b.plots.sqft}`} />
            <div>
              <label className="label">3. Register Date *</label>
              <input name="register_date" type="date" className="input" defaultValue={today} required />
            </div>
            <div>
              <label className="label">4. Register Number *</label>
              <input name="register_number" className="input" required />
            </div>
            <div>
              <label className="label">5. Name of Registrant *</label>
              <input name="name_of_registrant" className="input" defaultValue={b.customers.name} required />
            </div>
            <div>
              <label className="label">6. Mobile</label>
              <input name="mobile" className="input" defaultValue={b.customers.mobile} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">7. Remarks</label>
              <textarea name="remarks" className="textarea" rows={2} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-1 text-sm font-semibold">Payment / Loan</h2>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Record the amount collected at registration and how it was paid. Choose <b>Home Loan</b> to
            capture the lender and whether the customer or their Senior Director arranged it. Leave the
            amount blank if the plot is already fully paid.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Amount (₹)</label>
              <input
                name="amount"
                type="number"
                min={0}
                step="0.01"
                className="input"
                defaultValue={balance > 0 ? balance : undefined}
              />
              {balance > 0 && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Outstanding balance: ₹{balance.toLocaleString("en-IN")}
                </p>
              )}
            </div>
            <PaymentModeFields modeName="mode" label="Payment Mode" loanTokenBy />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/bookings/${b.id}`} className="btn-ghost">Cancel</Link>
          <SubmitButton className="btn-primary" pendingLabel="Registering…">Complete Registration</SubmitButton>
        </div>
      </form>
    </>
  );
}

function Readonly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="rounded-lg border bg-[var(--surface-2)] px-3 py-2 text-sm">{value}</div>
    </div>
  );
}
