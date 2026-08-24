import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import ReceiptView from "../ReceiptView";
import { bookingReceiptFields } from "../data";

export const dynamic = "force-dynamic";

// The BOOKING / BLOCKING receipt — the deal as a whole. A receipt for one
// individual payment lives at /receipts/payment/[paymentId].
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fields = await bookingReceiptFields(id);
  if (!fields) notFound();

  return <ReceiptView src={`/receipts/${id}/pdf`} title="Plot Booking Receipt" receiptNo={fields.receiptNo} />;
}
