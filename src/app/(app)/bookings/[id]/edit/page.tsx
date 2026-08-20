import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import { NOMINEE_RELATIONSHIPS } from "@/lib/options";
import CustomerFields from "@/components/CustomerFields";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { updateBooking } from "../../actions";
import PartnerDetailsFields from "../../PartnerDetailsFields";
import PaymentModeFields from "../../PaymentModeFields";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// Field name (as posted) → what to tell the user when the server rejects a save
// for it. Only reachable when HTML validation was bypassed.
const MISSING_LABEL: Record<string, string> = {
  name: "Customer Name",
  mobile: "Customer Mobile",
  email: "Email",
  dob: "D.O.B",
  street: "Street",
  area: "Area",
  pincode: "Pincode",
  state: "State",
  district: "District",
  country: "Country",
  occupation: "Occupation",
  occupation_remarks: "Occupation Remarks",
  nominee_name: "Nominee Name",
  nominee_mobile: "Nominee Mobile",
  nominee_relationship: "Nominee Relationship",
  partner_id: "Partner ID",
  partner_name: "Partner ID",
  mode_of_payment: "Mode of Payment",
  tentative_registration_date: "Tentative Registration Date",
  booked_date: "Booked Date",
  remarks: "Remarks",
};

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ missing?: string; err?: string }>;
}) {
  // Editing applies to both blockings and bookings — any creator (sales or admin)
  // may edit; create_blocking is held by all of them.
  const user = await requireCapability("create_blocking");
  // Mirrors the gate in updateBooking — see the note there.
  const mayEditCustomer = can(user.role, "manage_customers");
  const { id } = await params;
  const { missing, err } = await searchParams;
  const sb = getSupabase();

  const { data } = await sb
    .from("bookings")
    .select("*, plots(plot_no), customers(*), projects(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & {
    plots: Pick<Plot, "plot_no"> | null;
    customers: Customer | null;
    projects: Pick<Project, "name"> | null;
  };

  // Cancelled bookings are read-only.
  if (b.status === "cancelled") redirect(`/bookings/${id}`);

  return (
    <>
      <PageHeader
        title="Edit Booking Details"
        subtitle={`${b.projects?.name ?? "—"} · Plot ${b.plots?.plot_no ?? "—"} · ${b.customers?.name ?? "—"}`}
        back={{ href: `/bookings/${id}`, label: "← Back" }}
      />

      {missing && (
        <div className="mb-6 max-w-3xl rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          Nothing was saved — <b>{MISSING_LABEL[missing] ?? missing}</b> is required. Every field on this
          form must be filled in.
        </div>
      )}

      {err === "dup_mobile" && (
        <div className="mb-6 max-w-3xl rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Nothing was saved — that mobile number already belongs to another customer in this
          salesperson&apos;s book. Use a different number, or edit the existing customer instead.
        </div>
      )}

      <form action={updateBooking} className="max-w-3xl space-y-6">
        <input type="hidden" name="id" value={b.id} />

        {/* Editing here edits the linked customer record itself, so the change
            shows on their Clients page and on every other booking of theirs. */}
        {mayEditCustomer && (
        <div className="card">
          <h2 className="mb-1 text-sm font-semibold">Customer Details</h2>
          <p className="mb-4 text-xs text-[var(--muted)]">
            These belong to the customer record, not to this {b.book_mode ?? "booking"} alone — saving
            updates them everywhere {b.customers?.name ?? "this customer"} appears.
          </p>
          <CustomerFields c={b.customers ?? undefined} />
        </div>
        )}

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Nominee Details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Nominee Name *</label>
              <input name="nominee_name" className="input" defaultValue={b.nominee_name ?? ""} required />
            </div>
            <div>
              <label className="label">Nominee Mobile *</label>
              <input name="nominee_mobile" className="input" defaultValue={b.nominee_mobile ?? ""} required />
            </div>
            <div>
              <label className="label">Nominee Relationship *</label>
              <select name="nominee_relationship" className="select" defaultValue={b.nominee_relationship ?? ""} required>
                <option value="" disabled>Select</option>
                {NOMINEE_RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-1 text-sm font-semibold">Partner Details</h2>
          <p className="mb-4 text-xs text-[var(--muted)]">
            Enter the Partner ID (e.g. <span className="font-mono">VPBP47</span>) — the partner name and
            their director are fetched automatically.
          </p>
          <PartnerDetailsFields
            initial={{
              partnerId: b.partner_id,
              partnerCode: b.partner_code,
              partnerName: b.partner_name,
              seniorDirectorId: b.senior_director_id,
              seniorDirectorCode: b.senior_director_code,
              seniorDirectorName: b.senior_director_name,
              directorId: b.director_id,
              directorCode: b.director_code,
              directorName: b.director_name,
            }}
          />
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Payment & Dates</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Tentative Registration Date *</label>
              <input
                name="tentative_registration_date"
                type="date"
                className="input"
                defaultValue={b.tentative_registration_date ?? ""}
                required
              />
            </div>
            {/* "Loan Taken By" appears only when the mode is Loan — same rule
                as the booking form. Instrument details belong to an individual
                payment, not to the booking, so they stay off here. */}
            <PaymentModeFields
              modeName="mode_of_payment"
              label="Mode of Payment"
              defaultMode={b.mode_of_payment ?? ""}
              defaultLoanTokenBy={b.loan_token_by ?? ""}
              loanTokenBy
              instrumentFields={false}
              required
            />
            <div>
              <label className="label">Booked Date *</label>
              <input name="booked_date" type="date" className="input" defaultValue={b.booked_date ?? ""} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Remarks *</label>
              <input name="remarks" className="input" defaultValue={b.remarks ?? ""} required />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/bookings/${id}`} className="btn-ghost">Cancel</Link>
          <SubmitButton className="btn-primary" pendingLabel="Saving…">Save Changes</SubmitButton>
        </div>
      </form>
    </>
  );
}
