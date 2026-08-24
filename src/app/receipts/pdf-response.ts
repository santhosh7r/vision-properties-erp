import "server-only";
import { renderReceiptPdf, receiptFilename, type ReceiptFields } from "@/lib/receipt-pdf";

// Turns filled receipt fields into the HTTP response both PDF routes return.
// `?download=1` forces the browser to save the file; without it the bytes are
// served inline so the receipt page can preview them in an <iframe>.
export async function pdfResponse(fields: ReceiptFields, req: Request): Promise<Response> {
  const bytes = await renderReceiptPdf(fields);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = receiptFilename(fields.receiptNo, fields.name);

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      // A receipt must always reflect the ledger as it stands, and it is a
      // customer's financial document — never let a proxy hold a copy.
      "Cache-Control": "no-store, private",
    },
  });
}
