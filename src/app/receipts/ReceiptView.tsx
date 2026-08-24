"use client";

import { useState } from "react";
import { printPdf } from "@/lib/print-pdf";

// The receipt surface: the real `public/receipt.pdf` stationery, filled in and
// shown exactly as it will print. There is no HTML re-creation of the form any
// more — what is on screen IS the file, so what the customer is handed can never
// drift from what the office previewed. Print is the counter action; Download is
// there for filing a copy.
export default function ReceiptView({
  src,
  title,
  receiptNo,
}: {
  src: string;
  title: string;
  receiptNo: string;
}) {
  const [saving, setSaving] = useState(false);
  const downloadUrl = `${src}?download=1`;

  function handleDownload() {
    setSaving(true);
    const a = document.createElement("a");
    a.href = downloadUrl;
    // The route sets Content-Disposition: attachment, which names the file.
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => setSaving(false), 1200);
  }

  function handlePrint() {
    // Printed from a hidden frame rather than the visible preview below: the
    // preview is scrolled and sized for the screen, and some browsers carry that
    // state into the print job.
    printPdf(src);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#eef0f4" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 16px", background: "#fff", borderBottom: "1px solid #d8dce4",
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2a78" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#5b6376" }}>Receipt No : {receiptNo}</div>
        </div>
        <button type="button" onClick={handlePrint} style={btn(true)}>
          Print Receipt
        </button>
        <button type="button" onClick={handleDownload} disabled={saving} style={btn(false)}>
          {saving ? "Saving…" : "Download"}
        </button>
        <button type="button" onClick={() => window.close()} style={btn(false)}>
          Close
        </button>
      </div>

      <iframe
        id="receipt-frame"
        src={src}
        title={title}
        style={{ flex: 1, width: "100%", border: "none", minHeight: "calc(100vh - 62px)" }}
      />

      {/* A browser with no built-in PDF viewer renders nothing in the frame
          above, so the file stays reachable by link. */}
      <noscript>
        <a href={downloadUrl}>Download {title}</a>
      </noscript>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    background: primary ? "#1e2a78" : "transparent",
    color: primary ? "#fff" : "#1e2a78",
    border: primary ? "none" : "1px solid #1e2a78",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}
