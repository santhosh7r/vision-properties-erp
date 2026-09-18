import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getDistrictScope, projectInScope } from "@/lib/scope";
import { inr, fmtDate, fmtDateTime, shortRef } from "@/lib/format";
import { isValueCoupon, loanTokenByLabel } from "@/lib/options";
import { PageHeader, Badge, EmptyState, PlotStatusBadge } from "@/components/ui";
import PrintReceiptButton from "@/components/PrintReceiptButton";
import type { Booking, Customer, Payment, Plot, Project, Registration } from "@/lib/types";

export const dynamic = "force-dynamic";

// ============================================================================
// REGISTRATION DETAIL — the whole story of one registered plot on one page.
//
// A registered plot is the END of the journey (available → blocked/booked →
// registered), so this page is deliberately READ-ONLY: a registration is the
// record of a government document and is never edited or cancelled here. The
// booking it came from keeps its own page for anything actionable.
//
// Everything below the registration itself is pulled through `booking_id`:
// the customer, the sales chain and the money all live on the booking, not on
// the registration. `booking_id` is nullable, so every one of those sections
// degrades to "not recorded" rather than crashing — a row imported without its
// booking, or one whose booking was later deleted, still opens.
// ============================================================================
export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Same capability as the list and the Register Plot form: Admin, Legal and
  // Post-Sales. Sales roles cannot open a registration at all.
  const user = await requireCapability("manage_registration");
  const sb = getSupabase();

  const { data } = await sb
    .from("registrations")
    .select("*, plots(*, plot_categories(name)), projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Registration & {
    plots: (Plot & { plot_categories: { name: string } | null }) | null;
    projects: Project | null;
  };

  // A branch desk may only open its own district's registrations. notFound()
  // rather than a redirect: out of scope must be indistinguishable from
  // non-existent, or the URL becomes a way to probe other branches' deals.
  if (!projectInScope(await getDistrictScope(sb, user), r.project_id)) notFound();

  // The booking carries the customer, the sales chain and the payment ledger.
  const { data: bkData } = r.booking_id
    ? await sb
        .from("bookings")
        .select("*, customers(*)")
        .eq("id", r.booking_id)
        .maybeSingle()
    : { data: null };
  const b = (bkData ?? null) as (Booking & { customers: Customer | null }) | null;

  const [payRes, actorRes, couponRes] = await Promise.all([
    r.booking_id
      ? sb.from("payments").select("*").eq("booking_id", r.booking_id).order("paid_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    r.created_by
      ? sb.from("users").select("full_name, role").eq("id", r.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    // Coupons auto-issued BY this registration. createRegistration stamps the
    // register number into each coupon's note ("Gold coupon · registration
    // 3048/2026"), which is the only link between the two tables — there is no
    // registration_id on coupons. Matching on that suffix is therefore the
    // honest lookup, and it simply finds nothing for older rows or if the note
    // format ever changes.
    sb
      .from("coupons")
      .select("*, users(full_name, partner_code, role)")
      .eq("source", "auto")
      .ilike("note", `%registration ${r.register_number}`)
      .order("type"),
  ]);
  const payments = (payRes.data ?? []) as Payment[];
  const actor = actorRes.data as { full_name: string; role: string } | null;
  const coupons = (couponRes.data ?? []) as {
    id: string;
    type: string;
    value: number;
    quantity: number;
    note: string | null;
    users: { full_name: string; partner_code: string | null; role: string } | null;
  }[];

  const paid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const totalValue = Number(b?.total_plot_value ?? 0);
  const balance = Math.max(0, totalValue - paid);
  const address =
    [b?.customers?.street, b?.customers?.area, b?.customers?.district, b?.customers?.state, b?.customers?.pincode]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <>
      <PageHeader
        title={`Registration — ${r.register_number}`}
        subtitle={`${r.projects?.name ?? "—"} · Plot ${r.plots?.plot_no ?? "—"} · ${r.name_of_registrant}`}
        back={{ href: "/registrations", label: "← Registrations" }}
        action={r.booking_id ? <PrintReceiptButton id={r.booking_id} /> : undefined}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone="purple">Registered</Badge>
        {r.plots && <PlotStatusBadge status={r.plots.status} />}
        <span className="text-xs text-[var(--muted)]">Registered {fmtDate(r.register_date)}</span>
        {r.booking_id && (
          <Link
            href={`/bookings/${r.booking_id}`}
            className="rounded-md border px-2 py-0.5 font-mono text-xs text-[var(--muted)] hover:text-[var(--text)]"
            title="Open the booking this registration came from"
          >
            Ref {shortRef(r.booking_id)}
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Registration Details">
            <Grid>
              <F label="Register Number">{r.register_number}</F>
              <F label="Register Date">{fmtDate(r.register_date)}</F>
              <F label="Name of Registrant">{r.name_of_registrant}</F>
              <F label="Mobile">{r.mobile || "—"}</F>
              <F label="Registered Sq.ft">{r.plot_sqft ?? r.plots?.sqft ?? "—"}</F>
              <F label="Recorded By">
                {actor ? `${actor.full_name} (${actor.role.replace(/_/g, " ")})` : "—"}
              </F>
              <div className="sm:col-span-2">
                <F label="Remarks">{r.remarks || "—"}</F>
              </div>
            </Grid>
          </Section>

          <Section title="Plot & Project">
            <Grid>
              <F label="Project">{r.projects?.name ?? "—"}</F>
              <F label="Plot No">{r.plots?.plot_no ?? "—"}</F>
              <F label="Plot Type">{r.plots?.plot_categories?.name ?? r.block ?? r.plots?.block ?? "—"}</F>
              <F label="District / City">
                {[r.projects?.district, r.projects?.city].filter(Boolean).join(" · ") || "—"}
              </F>
              <F label="Price / Sq.ft">{r.plots ? inr(r.plots.price_per_sqft) : "—"}</F>
              <F label="Total Plot Value">{b ? inr(totalValue) : "—"}</F>
            </Grid>
          </Section>

          {/* Everything from here down hangs off the booking. */}
          {b?.customers ? (
            <Section title="Customer Details">
              <Grid>
                <F label="Name">{b.customers.name}</F>
                <F label="Mobile">{b.customers.mobile}</F>
                <F label="Email">{b.customers.email || "—"}</F>
                <F label="D.O.B">{fmtDate(b.customers.dob)}</F>
                <F label="Father&apos;s Name">{b.customers.father_name || "—"}</F>
                <F label="Father&apos;s Mobile">{b.customers.father_mobile || "—"}</F>
                <F label="Spouse&apos;s Name">{b.customers.spouse_name || "—"}</F>
                <F label="Spouse&apos;s Mobile">{b.customers.spouse_mobile || "—"}</F>
                <F label="Occupation">{b.customers.occupation || "—"}</F>
                <div className="sm:col-span-2">
                  <F label="Address">{address}</F>
                </div>
              </Grid>
            </Section>
          ) : (
            <Section title="Customer Details">
              <EmptyState
                message="No customer on file for this registration."
                hint="The customer is held on the booking, and this registration has none linked."
              />
            </Section>
          )}

          {b && (
            <>
              <Section title="Nominee Details">
                <Grid>
                  <F label="Name">{b.nominee_name || "—"}</F>
                  <F label="Mobile">{b.nominee_mobile || "—"}</F>
                  <F label="Relationship">{b.nominee_relationship || "—"}</F>
                </Grid>
              </Section>

              <Section title="Partner Details">
                <Grid>
                  <F label="Partner ID">{b.partner_code || "—"}</F>
                  <F label="Partner Name">{b.partner_name || "—"}</F>
                  <F label="Senior Director ID">{b.senior_director_code || "—"}</F>
                  <F label="Senior Director Name">{b.senior_director_name || "—"}</F>
                  <F label="Director ID">{b.director_code || "—"}</F>
                  <F label="Director Name">{b.director_name || "—"}</F>
                </Grid>
              </Section>
            </>
          )}

          <Section title={`Payments (${payments.length})`}>
            {payments.length === 0 ? (
              <EmptyState
                message="No payments recorded."
                hint={
                  r.booking_id
                    ? "Nothing was collected through the app against this booking."
                    : "Payments are recorded against a booking, and this registration has none linked."
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Kind</th>
                      <th className="th">Mode</th>
                      <th className="th">Reference</th>
                      <th className="th">Receipt No</th>
                      <th className="th">Amount</th>
                      <th className="th">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="td">{fmtDateTime(p.paid_at)}</td>
                        {/* 'final' is the money taken AT the register office — the
                            one payment this registration itself created. */}
                        <td className="td capitalize">
                          {p.kind === "final" ? <Badge tone="purple">final</Badge> : p.kind}
                        </td>
                        <td className="td">{p.mode ?? "—"}</td>
                        <td className="td">
                          {p.reference || p.bank_name || p.instrument_date ? (
                            <span className="text-xs">
                              {[p.reference, p.bank_name, p.instrument_date ? fmtDate(p.instrument_date) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="td font-mono text-xs">{p.receipt_no ?? "—"}</td>
                        <td className="td">{inr(p.amount)}</td>
                        <td className="td">
                          <PrintReceiptButton
                            href={`/receipts/payment/${p.id}`}
                            label="Print"
                            className="btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* What this registration paid out to the sales chain. Shown only when
              something was actually issued, so a plain registration is not
              padded with an empty card. */}
          {coupons.length > 0 && (
            <Section title={`Coupons Issued on Registration (${coupons.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="th">Issued To</th>
                      <th className="th">Role</th>
                      <th className="th">Type</th>
                      <th className="th">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="td">
                          {c.users?.full_name ?? "—"}
                          {c.users?.partner_code && (
                            <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">
                              {c.users.partner_code}
                            </span>
                          )}
                        </td>
                        <td className="td capitalize">{c.users?.role.replace(/_/g, " ") ?? "—"}</td>
                        <td className="td capitalize">{c.type}</td>
                        <td className="td">{isValueCoupon(c.type) ? inr(c.value) : `${c.quantity} token(s)`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        {/* Right rail: the money summary and the way back to the booking. */}
        <div className="space-y-6">
          <Section title="Summary">
            <div className="space-y-3">
              <Row label="Total Plot Value" value={b ? inr(totalValue) : "—"} />
              <Row label="Total Received" value={inr(paid)} />
              <Row
                label="Balance"
                value={inr(balance)}
                tone={b && balance > 0 ? "amber" : "green"}
              />
            </div>
          </Section>

          {b ? (
            <Section title="Source Booking">
              <div className="space-y-4">
                <Grid>
                  <F label="Ref">{shortRef(b.id)}</F>
                  <F label="Receipt No">{b.receipt_no ?? "—"}</F>
                  <F label="Mode">{b.book_mode}</F>
                  <F label="Booked Date">{fmtDate(b.booked_date)}</F>
                  <F label="Mode of Payment">{b.mode_of_payment || "—"}</F>
                  <F label="Loan Taken By">{b.loan_token_by ? loanTokenByLabel(b.loan_token_by) : "—"}</F>
                </Grid>
                <Link href={`/bookings/${b.id}`} className="btn-ghost w-full">
                  Open Booking
                </Link>
              </div>
            </Section>
          ) : (
            <Section title="Source Booking">
              <EmptyState
                message="No booking linked."
                hint="This registration was recorded without one, so there is no customer, sales chain or payment history behind it."
              />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
function Row({ label, value, tone }: { label: string; value: string; tone?: "amber" | "green" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === "amber" ? "text-amber-500" : tone === "green" ? "text-emerald-500" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
