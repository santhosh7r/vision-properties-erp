"use client";

// Small no-print toolbar above the receipt: trigger the browser print dialog or
// close the tab. Hidden when printing (class "no-print" handled by page CSS).
export default function ReceiptToolbar() {
  return (
    <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", margin: "16px 0" }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          background: "#1e2a78",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 18px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Print / Save as PDF
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        style={{
          background: "transparent",
          color: "#1e2a78",
          border: "1px solid #1e2a78",
          borderRadius: 8,
          padding: "9px 18px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Close
      </button>
    </div>
  );
}
