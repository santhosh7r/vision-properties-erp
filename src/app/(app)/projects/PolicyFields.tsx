import type { Project } from "@/lib/types";

// Renders Office Details + the editable SOP policy config. Used by both New and
// Edit project forms. `p` supplies current values when editing; otherwise SOP
// defaults show. Every field is a plain form input → persisted in actions.ts
// (officeFields() + policyFields()).
export default function PolicyFields({ p }: { p?: Partial<Project> }) {
  const v = (key: keyof Project, fallback: number) =>
    p?.[key] !== undefined && p?.[key] !== null ? (p[key] as number) : fallback;

  return (
    <>
      {/* Office Details — Admin panel · New Project Form §2 */}
      <div className="card">
        <h2 className="mb-1 text-sm font-semibold">Office Details</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Branch, guideline value and the per-sq.ft coupon rates that drive the Tokens &amp; Coupons issued
          for this project.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Branch</label>
            <input name="branch" className="input" defaultValue={p?.branch ?? ""} placeholder="e.g. Chennai" />
          </div>
          <Num name="guideline_value" label="Guideline Value (₹ / sq.ft)" def={v("guideline_value", 0)} step={50} />
          <Num name="director_gold_coupon" label="Director Gold Coupon (₹ / sq.ft)" def={v("director_gold_coupon", 0)} step={50} />
          <Num name="director_digital_coupon" label="Director Digital Coupon (₹ / sq.ft)" def={v("director_digital_coupon", 0)} step={50} />
          <Num name="senior_director_gold_coupon" label="Senior Director Gold Coupon (₹ / sq.ft)" def={v("senior_director_gold_coupon", 0)} step={50} />
          <Num name="director_tools_coupon" label="Director Tools Coupon (₹ / sq.ft)" def={v("director_tools_coupon", 0)} step={50} />
          <Num name="senior_director_tools_coupon" label="Senior Director Tools Coupon (₹ / sq.ft)" def={v("senior_director_tools_coupon", 0)} step={50} />
        </div>
      </div>

      {/* Blocking & Booking — Admin panel · New Project Form §3 */}
      <div className="card">
        <h2 className="mb-1 text-sm font-semibold">Blocking &amp; Booking</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          How plots are blocked and what advance a booking needs. Advance taken is the higher of the
          percentage or the booking amount.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Num name="blocking_amount" label="Blocking Amount (₹)" def={v("blocking_amount", 10000)} step={1000} />
          <Num name="blocking_window_hours" label="Blocking Validity (hours)" def={v("blocking_window_hours", 48)} min={1} />
          <Num name="advance_min_amount" label="Booking Amount (₹)" def={v("advance_min_amount", 50000)} step={1000} />
          <Num name="advance_percent" label="Booking Percentage (% of plot value)" def={v("advance_percent", 5)} step={0.5} />
          <Num name="booking_window_days" label="Validity (days)" def={v("booking_window_days", 15)} min={1} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold">§3 · Cancellation &amp; Refund</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Full refund if cancelled within the window; otherwise the admin charge is deducted. Payout SLA
          runs from approval.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Num name="cancel_full_refund_days" label="Full-refund Window (days)" def={v("cancel_full_refund_days", 3)} min={0} />
          <Num name="cancellation_charge" label="Admin Charge / plot (₹)" def={v("cancellation_charge", 5000)} step={500} />
          <Num name="refund_processing_days" label="Refund Payout SLA (working days)" def={v("refund_processing_days", 5)} min={0} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold">§7 · Plot Transfer / Change</h2>
        <p className="mb-4 text-xs text-[var(--muted)]">
          Charge applied when a booking is moved to a lower-value plot (downgrade). Upgrades are free.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Num name="transfer_charge" label="Transfer / Downgrade Charge (₹)" def={v("transfer_charge", 5000)} step={500} />
        </div>
      </div>
    </>
  );
}

function Num({
  name,
  label,
  def,
  min = 0,
  step,
}: {
  name: string;
  label: string;
  def: number;
  min?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name={name} type="number" min={min} step={step} className="input" defaultValue={def} />
    </div>
  );
}
