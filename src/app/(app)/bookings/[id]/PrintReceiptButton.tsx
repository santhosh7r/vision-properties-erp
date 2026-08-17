"use client";

import { useState } from "react";

// Prints a receipt WITHOUT navigating away: loads the receipt route into a
// hidden iframe and triggers the browser print dialog on it. Falls back to a new
// tab if the iframe can't be reached (e.g. blocked).
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
  const url = href ?? `/receipts/${id}`;

  function handlePrint() {
    setBusy(true);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.src = url;

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        window.open(url, "_blank");
        cleanup();
        return;
      }
      try {
        win.focus();
        win.print();
      } catch {
        window.open(url, "_blank");
      }
      setBusy(false);
      // Remove the iframe a bit after the dialog opens/closes.
      setTimeout(() => iframe.remove(), 60_000);
    };

    function cleanup() {
      setBusy(false);
      iframe.remove();
    }

    document.body.appendChild(iframe);
  }

  return (
    <button type="button" onClick={handlePrint} className={className} style={style} disabled={busy}>
      {busy ? "Preparing…" : label}
    </button>
  );
}
