"use client";

import { useEffect, useState } from "react";
import { printPdf } from "@/lib/print-pdf";

// The receipt surface: the real `public/receipt.pdf` stationery, filled in on an
// A4 page and shown exactly as it will print. There is no HTML re-creation of
// the form — what is on screen IS the file, so what the customer is handed can
// never drift from what the office previewed. Print is the counter action;
// Download is there for filing a copy.
//
// The office prints these from the counter desktop, from a laptop at a site
// office, and from a phone or tablet on a plot visit, so all three have to work:
//   · Desktop / laptop — the PDF previews inline and prints from the frame.
//   · Phone / tablet   — the browser hands PDFs to a native viewer instead of
//                        rendering them in a frame, so an inline preview would be
//                        a blank grey rectangle. Those devices get the receipt
//                        opened in their own viewer, which prints and shares it.
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
  // Assumed false until the browser is known, so the server render and the first
  // client render agree; the inline preview is the desktop case and appears
  // immediately after.
  const [nativeViewer, setNativeViewer] = useState(false);
  const downloadUrl = `${src}?download=1`;

  useEffect(() => {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setNativeViewer(iOS || /Android/.test(ua));
  }, []);

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
    // state into the print job. On a phone printPdf opens the native viewer.
    printPdf(src);
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#eef0f4" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 16px", background: "#fff", borderBottom: "1px solid #d8dce4",
        }}
      >
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
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

      {nativeViewer ? (
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 12, padding: "40px 20px", textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, color: "#5b6376", maxWidth: 380, lineHeight: 1.5 }}>
            The receipt is an A4 PDF. Open it to print or share it from this device.
          </div>
          <a href={src} target="_blank" rel="noopener" style={{ ...btn(true), textDecoration: "none" }}>
            Open Receipt
          </a>
        </div>
      ) : (
        <iframe
          id="receipt-frame"
          src={src}
          title={title}
          style={{ flex: 1, width: "100%", border: "none", minHeight: "60vh" }}
        />
      )}

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
    // Comfortable to hit with a thumb on a phone, unchanged on a desktop.
    minHeight: 40,
    whiteSpace: "nowrap",
  };
}
