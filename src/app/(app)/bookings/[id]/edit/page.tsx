import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import { NOMINEE_RELATIONSHIPS, PAYMENT_MODES } from "@/lib/options";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import { updateBooking } from "../../actions";
import PartnerDetailsFields from "../../PartnerDetailsFields";

export const dynamic = "force-dynamic";

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Editing applies to both blockings and bookings — any creator (sales or admin)
  // may edit; create_blocking is held by all of them.
  await requireCapability("create_blocking");
  const { id } = await params;
  const sb = getSupabase();

  const { data } = await sb
    .from("bookings")
    .select("*, plots(plot_no), customers(name), projects(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & {
    plots: Pick<Plot, "plot_no"> | null;
    customers: Pick<Customer, "name"> | null;
    projects: Pick<Project, "name"> | null;
  };

  // Cancelled bookings are read-only.
  if (b.status === "cancelled") redirect(`/bookings/${id}`);

  return (
    <>
      <PageHeader
        title="Edit Booking Details"
        subtitle={`${b.projects?.name ?? "—"} · Plot ${b.plots?.plot_no ?? "—"} · ${b.customers?.name ?? "—"}`}
        action={<Link href={`/bookings/${id}`} className="btn-ghost">Cancel</Link>}
      />

      <form action={updateBooking} className="max-w-3xl space-y-6">
        <input type="hidden" name="id" value={b.id} />

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold">Nominee Details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Nominee Name</label>
              <input name="nominee_name" className="input" defaultValue={b.nominee_name ?? ""} />
            </div>
            <div>
              <label className="label">Nominee Mobile</label>
              <input name="nominee_mobile" className="input" defaultValue={b.nominee_mobile ?? ""} />
            </div>
            <div>
              <label className="label">Nominee Relationship</label>
              <select name="nominee_relationship" className="select" defaultValue={b.nominee_relationship ?? ""}>
                <option value="">Select</option>
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
              <label className="label">Tentative Registration Date</label>
              <input
                name="tentative_registration_date"
                type="date"
                className="input"
                defaultValue={b.tentative_registration_date ?? ""}
              />
            </div>
            <div>
              <label className="label">Mode of Payment</label>
              <select name="mode_of_payment" className="select" defaultValue={b.mode_of_payment ?? ""}>
                <option value="">Select</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Loan Token By</label>
              <select name="loan_token_by" className="select" defaultValue={b.loan_token_by ?? ""}>
                <option value="">Select</option>
                <option value="customer">Customer</option>
                <option value="director">Director</option>
              </select>
            </div>
            <div>
              <label className="label">Booked Date</label>
              <input name="booked_date" type="date" className="input" defaultValue={b.booked_date ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Remarks</label>
              <input name="remarks" className="input" defaultValue={b.remarks ?? ""} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/bookings/${id}`} className="btn-ghost">Cancel</Link>
          <button type="submit" className="btn-primary">Save Changes</button>
        </div>
      </form>
    </>
  );
}
