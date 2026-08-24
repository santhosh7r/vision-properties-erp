import { requireUser } from "@/lib/auth";
import { bookingReceiptFields } from "../../data";
import { pdfResponse } from "../../pdf-response";

export const dynamic = "force-dynamic";

// The booking / blocking receipt as the office's own PDF stationery, filled in.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const fields = await bookingReceiptFields(id);
  if (!fields) return new Response("Receipt not found", { status: 404 });
  return pdfResponse(fields, req);
}
