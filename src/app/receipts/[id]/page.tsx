import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, ageFrom } from "@/lib/format";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import ReceiptDoc from "../ReceiptDoc";
import { bookingReceiptNo, customerBlock, plotBlock, salesChain, fmtDateOrBlank } from "../data";

export const dynamic = "force-dynamic";

// The BOOKING / BLOCKING receipt — the deal as a whole. A receipt for one
// individual payment lives at /receipts/payment/[paymentId].
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sb = getSupabase();

  const { data } = await sb
    .from("bookings")
    .select("*, plots(*), customers(*), projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & { plots: Plot; customers: Customer; projects: Project };

  // `advance_paid` is the running total from the ledger (see recomputePayment),
  // so a fully-paid deal shows the whole amount here — hence the label switches
  // rather than always claiming "Advance".
  const paid = Number(b.advance_paid || 0) || Number(b.blocking_amount || 0);
  const fullyPaid = b.payment_status === "completed";
  const totalValue = Number(b.total_plot_value || 0);
  const chain = salesChain(b);

  return (
    <ReceiptDoc
      data={{
        title: b.book_mode === "blocking" ? "PLOT BLOCKING RECEIPT" : "PLOT BOOKING RECEIPT",
        receiptNo: bookingReceiptNo(b.id),
        date: fmtDate(b.booked_date ?? b.created_at),
        customer: { ...customerBlock(b.customers), age: ageFrom(b.customers?.dob), nominee: b.nominee_name },
        plot: plotBlock(b),
        payment: {
          amountLabel: fullyPaid ? "Total Received ₹" : "Advance Amount ₹",
          amount: paid,
          mode: b.mode_of_payment,
          tentativeRegDate: fmtDateOrBlank(b.tentative_registration_date),
          directorNameId: chain.director,
          partnerNameId: chain.partner,
          // Same ledger line the per-payment receipt carries, so whichever bill
          // the customer is handed states the position the same way.
          totalValue,
          paidToDate: paid,
          balance: Math.max(0, totalValue - paid),
        },
      }}
    />
  );
}
