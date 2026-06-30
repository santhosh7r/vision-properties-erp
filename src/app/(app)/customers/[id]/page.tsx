import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader, Badge, BookingStatusBadge, PaymentBadge, EmptyState } from "@/components/ui";
import type { Booking, Customer, Plot, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup?: string }>;
}) {
  const { id } = await params;
  const { dup } = await searchParams;
  const user = await requireCapability("manage_customers");
  const sb = getSupabase();

  const { data: c } = await sb.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const customer = c as Customer;
  // A sales user may only view a customer they created. Admin sees all.
  if (user.role !== "admin" && customer.created_by !== user.id) notFound();

  const { data: bk } = await sb
    .from("bookings")
    .select("*, plots(plot_no), projects(name)")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });
  const bookings = (bk ?? []) as (Booking & {
    plots: Pick<Plot, "plot_no">;
    projects: Pick<Project, "name">;
  })[];

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={`${customer.mobile}${customer.occupation ? " · " + customer.occupation : ""}`}
        back={{ href: "/customers", label: "← Customers" }}
        action={<Link href={`/customers/${id}/edit`} className="btn-primary">Edit</Link>}
      />

      {dup && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
          A customer with this mobile already exists — showing the existing record (duplicate prevented).
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-1">
          <span className="text-sm font-semibold">Customer Details</span>
          <Row label="Email">{customer.email ?? "—"}</Row>
          <Row label="D.O.B">{fmtDate(customer.dob)}</Row>
          <Row label="Street">{customer.street ?? "—"}</Row>
          <Row label="Area">{customer.area ?? "—"}</Row>
          <Row label="Pincode">{customer.pincode ?? "—"}</Row>
          <Row label="District">{customer.district ?? "—"}</Row>
          <Row label="State">{customer.state ?? "—"}</Row>
          <Row label="Country">{customer.country ?? "—"}</Row>
          <Row label="Occupation">{customer.occupation ?? "—"}</Row>
          {customer.occupation_remarks && <Row label="Remarks">{customer.occupation_remarks}</Row>}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Booking &amp; Blocking History ({bookings.length})</h2>
            {bookings.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge tone="blue">{bookings.filter((b) => b.book_mode === "booking").length} booking</Badge>
                <Badge tone="amber">{bookings.filter((b) => b.book_mode === "blocking").length} blocking</Badge>
                <Badge tone="red">{bookings.filter((b) => b.status === "cancelled").length} cancelled</Badge>
              </div>
            )}
          </div>

          {bookings.length === 0 ? (
            <div className="card">
              <EmptyState message="No bookings or blockings for this customer yet." />
            </div>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="card space-y-4">
                {/* header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                  <div>
                    <div className="font-medium">
                      {b.projects?.name} · Plot {b.plots?.plot_no}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={b.book_mode === "blocking" ? "amber" : "blue"}>{b.book_mode}</Badge>
                      <BookingStatusBadge status={b.status} />
                      <PaymentBadge status={b.payment_status} />
                      <span className="text-xs text-[var(--muted)]">Booked {fmtDate(b.booked_date)}</span>
                    </div>
                  </div>
                  <Link href={`/bookings/${b.id}`} className="btn-ghost" style={{ fontSize: 12, padding: "5px 12px" }}>
                    Open Booking
                  </Link>
                </div>

                {/* full captured detail */}
                <Section title="Plot & Value">
                  <D label="Plot Sq.ft">{b.plot_sqft ?? "—"}</D>
                  <D label="Total Plot Value">{inr(b.total_plot_value)}</D>
                  {b.book_mode === "blocking" && <D label="Blocking Amount">{inr(b.blocking_amount)}</D>}
                  <D label="Advance Required">{inr(b.advance_required)}</D>
                  <D label="Advance Paid">{inr(b.advance_paid)}</D>
                </Section>

                <Section title="Nominee">
                  <D label="Name">{b.nominee_name ?? "—"}</D>
                  <D label="Mobile">{b.nominee_mobile ?? "—"}</D>
                  <D label="Relationship">{b.nominee_relationship ?? "—"}</D>
                </Section>

                <Section title="Partner / Director">
                  <D label="Partner">{b.partner_name ?? "—"}</D>
                  <D label="Director">{b.director_name ?? "—"}</D>
                </Section>

                <Section title="Payment & Dates">
                  <D label="Tentative Registration">{fmtDate(b.tentative_registration_date)}</D>
                  <D label="Mode of Payment">{b.mode_of_payment ?? "—"}</D>
                  <D label="Loan Taken By">{b.loan_token_by ?? "—"}</D>
                  <D label="Booked Date">{fmtDate(b.booked_date)}</D>
                </Section>

                {(b.remarks || (b.refund_status && b.refund_status !== "none")) && (
                  <Section title="Notes">
                    {b.remarks && <D label="Remarks">{b.remarks}</D>}
                    {b.refund_status && b.refund_status !== "none" && (
                      <>
                        <D label="Refund Status">{b.refund_status.replace("_", " ")}</D>
                        <D label="Refund Amount">{inr(b.refund_amount ?? 0)}</D>
                      </>
                    )}
                  </Section>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function D({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}
