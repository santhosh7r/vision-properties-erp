import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import ReceiptView from "../../ReceiptView";
import { paymentReceiptFields } from "../../data";

export const dynamic = "force-dynamic";

// A receipt for ONE money entry — the blocking amount, the advance, an
// installment, the final payment.
export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fields = await paymentReceiptFields(id);
  if (!fields) notFound();

  return (
    <ReceiptView src={`/receipts/payment/${id}/pdf`} title="Payment Receipt" receiptNo={fields.receiptNo} />
  );
}
