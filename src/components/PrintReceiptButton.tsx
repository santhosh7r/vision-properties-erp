"use client";

import { useState } from "react";
import { printPdf } from "@/lib/print-pdf";

// Prints a receipt on the office's own PDF stationery, filled in — WITHOUT
// navigating away. The bytes come from the receipt route's /pdf handler, which
// returns the real `public/receipt.pdf` with the record's values drawn onto it,
// so what comes out of the printer is the same document the receipt page shows.
// Saving a copy is the receipt page's job; this button is the counter action —
// take the payment, hand over the printed bill.
//   · booking receipt  → <PrintReceiptButton id={booking.id} />
//   · payment receipt  → <PrintReceiptButton href={`/receipts/payment/${p.id}`} … />
export default function PrintReceiptButton({
  id,
  href,
  label = "Print Receipt",
  className = "btn-ghost",
  style,
}: {
  id?: string;
  href?: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const base = href ?? `/receipts/${id}`;

  function handlePrint() {
    setBusy(true);
    printPdf(`${base}/pdf`);
    // The dialog opens off-thread; the button is only briefly disabled so a
    // double click cannot fetch the same ~8MB file twice.
    setTimeout(() => setBusy(false), 2000);
  }

  return (
    <button type="button" onClick={handlePrint} className={className} style={style} disabled={busy}>
      {busy ? "Preparing…" : label}
    </button>
  );
}
