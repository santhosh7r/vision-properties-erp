"use client";

import { useState } from "react";

// Prints the booking receipt WITHOUT navigating away: loads /receipts/[id] into
// a hidden iframe and triggers the browser print dialog on it. Falls back to a
// new tab if the iframe can't be reached (e.g. blocked).
export default function PrintReceiptButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);

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
    iframe.src = `/receipts/${id}`;

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        window.open(`/receipts/${id}`, "_blank");
        cleanup();
        return;
      }
      try {
        win.focus();
        win.print();
      } catch {
        window.open(`/receipts/${id}`, "_blank");
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
    <button type="button" onClick={handlePrint} className="btn-ghost" disabled={busy}>
      {busy ? "Preparing…" : "Print Receipt"}
    </button>
  );
}
