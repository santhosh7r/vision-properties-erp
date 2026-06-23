import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { num, fmtDate, amountInWords, ageFrom } from "@/lib/format";
import type { Booking, Customer, Plot, Project } from "@/lib/types";
import ReceiptToolbar from "./ReceiptToolbar";

export const dynamic = "force-dynamic";

// Company details (printed header). Update here if the office details change.
const COMPANY = {
  name: "VISION PROPERTIES",
  address: "Vision Tower, 2nd Street, Ashok Nagar, RMS Colony, Karumandapam, Trichy-1",
  website: "www.visionproperties.co",
  helpline: "62621 32321",
  years: "27",
  since: "1998",
};

// Booking terms (Tamil) — printed at the foot of the receipt.
const TERMS: string[] = [
  "மனையை முன் பதிவு செய்த நாளிலிருந்து 15 நாட்களுக்குள் முழு தொகையையும் செலுத்த வேண்டும். தவறும் பட்சத்தில் முழு தொகையையும் இழந்து அந்நாளில் வேறு மனையை நீங்கள் தேர்வு செய்து பதிவு செய்து கொள்ளலாம்.",
  "இடையூறு இல்லா பத்திர பதிவு செயல்முறை வசதிக்காக பத்திர பதிவு தேதிக்கு மூன்று நாட்கள் முன்பாக முழு தொகையையும் செலுத்த வேண்டும்.",
  "முன் பதிவு செய்த நாளிலிருந்து 3 நாட்களுக்கு மேல் பதிவு செய்த மனையை நீங்கள் ரத்து செய்தாலோ, வேறு மனைக்கு மாற்றம் செய்தாலோ நிர்வாக செயல்முறைக்காக உங்கள் முன் பணத்திலிருந்து ஒரு மனைக்கு ரூ.10,000/- பிடித்தம் செய்யப்படும்.",
  "மனையை முன் பதிவு செய்த பிறகு எந்த பாதிப்பு ஏற்பட்டாலும் நிர்வாக அலுவலகம் மூலம் மட்டுமே பரிகாரம் செய்ய அறிவுறுத்தப்படும்.",
];

const RED = "#c8102e";
const NAVY = "#1e2a78";

const PRINT_CSS = `
/* margin:0 makes browsers omit their own header/footer (URL, title, date, page no.) */
@page { size: A4; margin: 0; }
@media print {
  .no-print { display: none !important; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .page-wrap { padding: 0 !important; background: #fff !important; min-height: 0 !important; }
  .receipt {
    width: 100% !important; max-width: none !important; margin: 0 !important;
    border: none !important; border-radius: 0 !important; box-shadow: none !important;
    padding: 8mm 10mm !important; font-size: 11px !important;
  }
}
.receipt, .receipt * { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
`;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const sb = getSupabase();

  const { data } = await sb
    .from("bookings")
    .select("*, plots(*), customers(*), projects(*)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const b = data as Booking & { plots: Plot; customers: Customer; projects: Project };
  const c = b.customers;
  const p = b.plots;
  const proj = b.projects;

  const paid = Number(b.advance_paid || 0) || Number(b.blocking_amount || 0);
  const receiptNo = `VPT${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const address = [c?.street, c?.area, c?.district, c?.state, c?.pincode, c?.country]
    .filter(Boolean)
    .join(", ");
  const sqft = b.plot_sqft ?? p?.sqft ?? null;

  return (
    <div className="page-wrap" style={{ background: "#eef0f4", minHeight: "100vh", padding: "8px 0 32px" }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <ReceiptToolbar />

      <div
        className="receipt"
        style={{
          width: 820,
          maxWidth: "calc(100% - 24px)",
          margin: "0 auto",
          background: "#fff",
          color: "#111",
          border: "2px solid #cfd3dc",
          borderRadius: 6,
          padding: "16px 22px",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: `2px solid ${RED}`, paddingBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Vision Properties"
            style={{ width: 64, height: 64, objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: 26, letterSpacing: 1 }}>{COMPANY.name}</div>
            <div style={{ fontSize: 11.5, color: "#333" }}>{COMPANY.address}</div>
            <div style={{ fontSize: 11.5, color: "#333" }}>{COMPANY.website}</div>
            <div style={{ fontSize: 11.5, color: "#333" }}>Helpline {COMPANY.helpline}</div>
          </div>
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%", border: `3px solid ${RED}`, color: NAVY,
              display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1, flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{COMPANY.years}</div>
              <div style={{ fontSize: 7.5, fontWeight: 700 }}>YEARS</div>
            </div>
          </div>
        </div>

        {/* No / Date */}
        <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 0 6px", fontWeight: 600 }}>
          <span>No : {receiptNo}</span>
          <span>Date : {fmtDate(b.booked_date ?? b.created_at)}</span>
        </div>

        {/* Title */}
        <div style={{ textAlign: "center", margin: "4px 0 14px" }}>
          <span style={{ background: NAVY, color: "#fff", fontWeight: 700, fontSize: 14, padding: "5px 18px", borderRadius: 4, letterSpacing: 0.5 }}>
            {b.book_mode === "blocking" ? "PLOT BLOCKING RECEIPT" : "PLOT BOOKING RECEIPT"}
          </span>
        </div>

        {/* Customer Details */}
        <SectionLabel>CUSTOMER DETAILS</SectionLabel>
        <Row>
          <Field label="Customer Name" value={c?.name} grow={3} />
          <Field label="Age" value={ageFrom(c?.dob)} grow={1} />
        </Row>
        <Row>
          <Field label="Father / Husband Name" value="" />
        </Row>
        <Row>
          <Field label="Phone Number" value={c?.mobile} />
          <Field label="Whatsapp Number" value={c?.mobile} />
        </Row>
        <Row>
          <Field label="Address" value={address} />
        </Row>
        <Row>
          <Field label="Anniversary" value={fmtDateOrBlank((c as { anniversary_date?: string | null })?.anniversary_date)} />
          <Field label="D.O.B" value={fmtDateOrBlank(c?.dob)} />
          <Field label="Occupation" value={c?.occupation} />
        </Row>

        {/* Plot Details */}
        <SectionLabel>PLOT DETAILS</SectionLabel>
        <Row>
          <Field label="Project Name" value={proj?.name} />
        </Row>
        <Row>
          <Field label="Project Area" value={proj?.area} />
          <Field label="Sector" value={p?.block ?? ""} />
        </Row>
        {/* Plot No / Facing / Total Sq.ft boxed row */}
        <div style={{ display: "flex", border: `1.5px solid ${RED}`, borderRadius: 4, margin: "8px 0 4px", overflow: "hidden" }}>
          <BoxCell label="Plot No" value={p?.plot_no} />
          <BoxCell label="Facing" value="" />
          <BoxCell label="Total Sq.ft" value={sqft != null ? num(sqft) : ""} last />
        </div>

        {/* Payment Details */}
        <SectionLabel>PAYMENT DETAILS</SectionLabel>
        <Row>
          <Field label="Advance Amount ₹" value={paid ? num(paid) : ""} />
          <Field label="Payment Mode" value={b.mode_of_payment ?? ""} />
        </Row>
        <Row>
          <Field label="In Words Rupees" value={paid ? amountInWords(paid) : ""} />
        </Row>
        <Row>
          <Field label="Partner ID" value={b.partner_code ?? ""} />
          <Field label="Tentative Reg Date" value={fmtDateOrBlank(b.tentative_registration_date)} />
          <Field label="Director ID" value={b.director_code ?? ""} />
        </Row>

        {/* Terms */}
        <div style={{ marginTop: 9, background: "#eef0fb", border: `1px solid ${NAVY}33`, borderRadius: 6, padding: "7px 12px" }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 3 }}>நிபந்தனைகள்</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 10.5, color: "#222", lineHeight: 1.5 }}>
            {TERMS.map((t, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{t}</li>
            ))}
          </ol>
          <div style={{ marginTop: 5, fontSize: 10.5, fontStyle: "italic", color: "#222" }}>
            பத்திரப்பதிவு செய்யும்போது இந்த ரசீது திரும்ப பெற்றுக் கொள்ளப்படும். மேற்கண்ட நிபந்தனைகளை
            முழுமையாக ஏற்றுக்கொண்டு முழு மனதுடன் நான் மனையை முன்பதிவு செய்து கொள்கிறேன்.
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 22, textAlign: "center" }}>
          <SignCol label="Authorised Signatory" />
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 150, height: 64, border: "1px solid #999", borderRadius: 4, margin: "0 auto 4px" }} />
            <div style={{ fontWeight: 600, fontSize: 12 }}>Office Use</div>
          </div>
          <SignCol label="Customer Signature" />
        </div>
      </div>
    </div>
  );
}

function fmtDateOrBlank(v: string | null | undefined): string {
  if (!v) return "";
  const d = fmtDate(v);
  return d === "—" ? "" : d;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "9px 0 5px" }}>
      <span style={{ background: RED, color: "#fff", fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 3, letterSpacing: 0.5 }}>
        {children}
      </span>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 22, marginBottom: 7 }}>{children}</div>;
}

function Field({ label, value, grow = 1 }: { label: string; value?: string | null; grow?: number }) {
  return (
    <div style={{ flex: grow, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
        <span style={{ fontSize: 12, color: "#333", whiteSpace: "nowrap" }}>{label} :</span>
        <span
          style={{
            flex: 1, minWidth: 0, borderBottom: "1px dotted #777", paddingBottom: 1,
            fontWeight: 600, fontSize: 13, minHeight: 18, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {value || ""}
        </span>
      </div>
    </div>
  );
}

function BoxCell({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <div style={{ flex: 1, borderRight: last ? "none" : `1.5px solid ${RED}`, padding: "6px 10px" }}>
      <div style={{ color: RED, fontWeight: 700, fontSize: 11.5 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 14, minHeight: 18 }}>{value || ""}</div>
    </div>
  );
}

function SignCol({ label }: { label: string }) {
  return (
    <div style={{ width: 180 }}>
      <div style={{ borderTop: "1px solid #444", paddingTop: 4, fontWeight: 600, fontSize: 12 }}>{label}</div>
    </div>
  );
}
