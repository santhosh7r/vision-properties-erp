import { requireUser } from "@/lib/auth";
import { paymentReceiptFields } from "../../../data";
import { pdfResponse } from "../../../pdf-response";

export const dynamic = "force-dynamic";

// One money entry's receipt, on the same PDF stationery as the booking receipt.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fields = await paymentReceiptFields(id);
  if (!fields) return new Response("Receipt not found", { status: 404 });
  return pdfResponse(fields, req);
}
