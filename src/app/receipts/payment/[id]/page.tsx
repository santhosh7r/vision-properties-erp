import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime, ageFrom } from "@/lib/format";
import type { Booking, Customer, Payment, Plot, Project } from "@/lib/types";
import ReceiptDoc from "../../ReceiptDoc";
import {
  paymentReceiptNo,
  customerBlock,
  plotBlock,
  salesChain,
  fmtDateOrBlank,
  PAYMENT_KIND_LABEL,
} from "../../data";

export const dynamic = "force-dynamic";

// A receipt for ONE money entry — the blocking amount, the advance, an
// installment, the final payment. Printable at any time from the Payments table
// on the booking (and from the Payments list), so every rupee taken has its own
// bill on demand rather than only at the moment it was recorded.
export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sb = getSupabase();

  const { data } = await sb
    .from("payments")
    .select("*, bookings(*, plots(*), customers(*), projects(*))")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const pay = data as Payment & {
    bookings: (Booking & { plots: Plot; customers: Customer; projects: Project }) | null;
  };
  const b = pay.bookings;
  if (!b) notFound();

  // Everything completed on or before this payment — so the receipt states the
  // customer's position AT THIS POINT, not as it is today. Reprinting an old
  // receipt therefore always produces the same document.
  const { data: priorData } = await sb
    .from("payments")
    .select("amount, paid_at, id")
    .eq("booking_id", b.id)
    .eq("status", "completed")
    .lte("paid_at", pay.paid_at);
  const paidToDate = ((priorData ?? []) as Pick<Payment, "amount" | "paid_at" | "id">[])
    // A same-instant tie would otherwise be counted or dropped arbitrarily; keep
    // rows at the same timestamp only up to and including this one by id.
    .filter((r) => r.paid_at < pay.paid_at || r.id <= pay.id)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const totalValue = Number(b.total_plot_value || 0);
  const chain = salesChain(b);
  const reference = [pay.reference, pay.bank_name, pay.instrument_date ? fmtDate(pay.instrument_date) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReceiptDoc
      data={{
        title: "PAYMENT RECEIPT",
        receiptNo: paymentReceiptNo(b.id, pay.id),
        date: fmtDateTime(pay.paid_at),
        customer: { ...customerBlock(b.customers), age: ageFrom(b.customers?.dob), nominee: b.nominee_name },
        plot: plotBlock(b),
        payment: {
          amountLabel: "Amount Received ₹",
          amount: Number(pay.amount || 0),
          mode: pay.mode,
          reference: reference || null,
          towards: PAYMENT_KIND_LABEL[pay.kind] ?? pay.kind,
          tentativeRegDate: fmtDateOrBlank(b.tentative_registration_date),
          directorNameId: chain.director,
          partnerNameId: chain.partner,
          totalValue,
          paidToDate,
          balance: Math.max(0, totalValue - paidToDate),
        },
      }}
    />
  );
}
