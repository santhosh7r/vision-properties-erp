import { requireUser } from "@/lib/auth";
import { BILL_UNVERIFIED, bookingReceiptFields } from "../../data";
import { pdfResponse } from "../../pdf-response";

export const dynamic = "force-dynamic";

// The booking / blocking receipt as the office's own PDF stationery, filled in.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fields = await bookingReceiptFields(id);
  if (!fields) return new Response("Receipt not found", { status: 404 });
  // Customer and plot details not yet verified by Admin — no bill (lib/bill).
  if (fields === BILL_UNVERIFIED) {
    return new Response("Bill on hold: Admin has not yet verified the customer and plot details.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return pdfResponse(fields, req);
}
