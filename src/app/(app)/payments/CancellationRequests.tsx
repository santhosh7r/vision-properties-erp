import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDateTime } from "@/lib/format";
import { cancelBooking, dismissCancellationRequest } from "../bookings/actions";

export interface CancelRequestRow {
  id: string;
  customer: string;
  project: string;
  plot: string;
  mode: string;
  requestedBy: string;
  reason: string;
  requestedAt: string;
}

// Admin's queue of sales-raised cancellation requests, shown atop Payments &
// Cancellation. Cancelling runs the refund and releases the plot; dismissing
// clears the request and keeps the booking active.
export default function CancellationRequests({ rows, canAct }: { rows: CancelRequestRow[]; canAct: boolean }) {
  if (rows.length === 0) return null;

  return (
    <div className="card mb-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        Cancellation Requests
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
          {rows.length}
        </span>
      </h2>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Raised by sales for Admin review. Cancelling runs the refund policy and releases the plot;
        dismissing keeps the booking active.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <th className="pb-2 pr-3 font-medium">Customer</th>
              <th className="pb-2 pr-3 font-medium">Mode</th>
              <th className="pb-2 pr-3 font-medium">Requested By</th>
              <th className="pb-2 pr-3 font-medium">Reason</th>
              <th className="pb-2 pr-3 font-medium">Requested</th>
              <th className="pb-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3">
                  <Link href={`/bookings/${r.id}`} className="font-medium hover:underline">
                    {r.customer}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">
                    {r.project} · Plot {r.plot}
                  </div>
                </td>
                <td className="py-2 pr-3 capitalize">{r.mode}</td>
                <td className="py-2 pr-3">{r.requestedBy}</td>
                <td className="max-w-xs py-2 pr-3 text-[var(--muted)]">{r.reason}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-[var(--muted)]">{fmtDateTime(r.requestedAt)}</td>
                <td className="py-2 text-right">
                  {canAct ? (
                    <div className="flex justify-end gap-1">
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn-danger" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">
                          Cancel
                        </SubmitButton>
                      </form>
                      <form action={dismissCancellationRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton className="btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} pendingLabel="…">
                          Dismiss
                        </SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Admin only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
