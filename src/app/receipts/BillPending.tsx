import Link from "next/link";
import { BILL_PENDING_NOTE } from "@/lib/bill";

// Shown in place of a receipt whose booking still awaits Admin verification of
// its customer and plot details (lib/bill). The receipt pages are standalone,
// so this carries its own way back.
export default function BillPending({ bookingId }: { bookingId?: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--background)" }}>
      <div className="card w-full max-w-md text-center">
        <h1 className="text-base font-semibold">Bill on hold</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{BILL_PENDING_NOTE}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">The payment itself is recorded — only the bill waits.</p>
        {bookingId && (
          <Link href={`/bookings/${bookingId}`} className="btn-primary mt-5 inline-flex">
            Open the booking
          </Link>
        )}
      </div>
    </div>
  );
}
