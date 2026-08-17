import { num, amountInWords } from "@/lib/format";
import ReceiptToolbar from "./ReceiptToolbar";

// ---------------------------------------------------------------------------
// The printed receipt — one component behind BOTH receipt routes:
//   /receipts/[bookingId]         the booking / blocking receipt
//   /receipts/payment/[paymentId] a receipt for ONE money entry, printable at
//                                 any time from the Payments table
// Laid out to match `public/plot booking receipt form.pdf` field for field, so
// a printout drops onto the pre-printed stationery the office already uses.
// ---------------------------------------------------------------------------

export const COMPANY = {
  name: "VISION PROPERTIES",
  offices: [
    {
      label: "CHENNAI OFFICE",
      lines: ["Vision Chambers, 71-35, Nambi St, Thirumal Nagar,", "Nambi Nagar, Poonamalee, Chennai - 600056."],
    },
    {
      label: "TRICHY OFFICE",
      lines: ["Vision Tower, 2nd Street, Ashok Nagar West,", "R.M.S. Colony, Karumandapam, Tiruchirappalli - 620001."],
    },
  ],
  website: "www.visionproperties.co",
  helpline: "62621 32321",
  years: "27",
};

// Booking terms (Tamil) — printed at the foot of the receipt, worded as on the
// PDF form. Item 3's administration charge is ₹5,000 there.
const TERMS: string[] = [
  "மனையை முன்பதிவு செய்த நாளிலிருந்து 15 நாட்களுக்குள் முழு தொகையையும் செலுத்த வேண்டும். தவறும் பட்சத்தில், முன்பதிவு செய்யப்பட்ட மனை ரத்து செய்யப்படும். பின்னர் முழுத் தொகையையும் செலுத்தும் நாளில், கிடைக்கக் கூடிய வேறு மனையையம் தேர்வு செய்து பதிவிடம் செய்து கொள்ளலாம்.",
  "தடையற்ற பத்திரப்பதிவு செயல்முறைக்காக, பத்திரப்பதிவு தேதிக்கு குறைந்தது மூன்று நாட்களுக்கு முன்பாக முழுத் தொகையையும் செலுத்த வேண்டும்.",
  "முன்பதிவு செய்த நாளிலிருந்து மூன்று நாட்களுக்குப் பிறகு, முன்பதிவு செய்யப்பட்ட மனையை ரத்து செய்தாலோ அல்லது வேறு மனைக்கு மாற்றம் செய்தாலோ, நிர்வாகக் கட்டணமாக ஒரு மனைக்கு ₹5,000 முன்பதிவுத் தொகையிலிருந்து பிடித்தம் செய்யப்படும்.",
  "மனையை முன்பதிவு செய்த பிறகு எந்த பாதிப்பு ஏற்பட்டாலும் நிர்வாக அலுவலகம் மூலம் மட்டுமே பரிகாரம் செய்ய அறிவுறுத்தப்படுகிறது.",
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

export interface ReceiptData {
  title: string;
  receiptNo: string;
  date: string;
  customer: {
    name?: string | null;
    age?: string | null;
    fatherOrSpouse?: string | null;
    email?: string | null;
    phone?: string | null;
    nominee?: string | null;
    address?: string | null;
    anniversary?: string | null;
    dob?: string | null;
    occupation?: string | null;
  };
  plot: {
    project?: string | null;
    location?: string | null;
    plotNo?: string | null;
    sector?: string | null;
    totalSqft?: number | null;
  };
  payment: {
    amountLabel: string; // "Advance Amount ₹" on a booking, "Amount Received ₹" on a payment
    amount: number;
    mode?: string | null;
    reference?: string | null;
    tentativeRegDate?: string | null;
    directorNameId?: string | null;
    partnerNameId?: string | null;
    // Ledger context — only shown on a single-payment receipt.
    towards?: string | null; // blocking / advance / installment / final
    totalValue?: number | null;
    paidToDate?: number | null;
    balance?: number | null;
  };
}

export default function ReceiptDoc({ data }: { data: ReceiptData }) {
  const { customer: c, plot: p, payment: pay } = data;
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
        {/* Header — logo · name + both offices · years badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Vision Properties"
            style={{ width: 64, height: 64, objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ color: RED, fontWeight: 800, fontSize: 26, letterSpacing: 1 }}>{COMPANY.name}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 3 }}>
              {COMPANY.offices.map((o) => (
                <div key={o.label} style={{ fontSize: 9, color: "#333", textAlign: "left" }}>
                  <div style={{ fontWeight: 700, color: NAVY }}>{o.label}</div>
                  {o.lines.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: RED, fontWeight: 700, marginTop: 3 }}>
              For More Information : {COMPANY.helpline} &nbsp;|&nbsp; {COMPANY.website}
            </div>
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

        {/* Receipt No · Title · Date */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "12px 0 10px" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Receipt No : {data.receiptNo}</span>
          <span style={{ background: NAVY, color: "#fff", fontWeight: 700, fontSize: 14, padding: "5px 18px", borderRadius: 4, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            {data.title}
          </span>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Date : {data.date}</span>
        </div>

        {/* Customer Details */}
        <SectionLabel>CUSTOMER DETAILS</SectionLabel>
        <Row>
          <Field label="Customer Name" value={c.name} grow={3} />
          <Field label="Age" value={c.age} grow={1} />
        </Row>
        <Row>
          <Field label="Father's / Spouse's Name" value={c.fatherOrSpouse} />
          <Field label="Email ID" value={c.email} />
        </Row>
        <Row>
          <Field label="Phone Number" value={c.phone} />
          <Field label="Nominee name" value={c.nominee} />
        </Row>
        <Row>
          <Field label="Address" value={c.address} />
        </Row>
        <Row>
          <Field label="Anniversary" value={c.anniversary} />
          <Field label="D.O.B" value={c.dob} />
          <Field label="Occupation" value={c.occupation} />
        </Row>

        {/* Plot Details */}
        <SectionLabel>PLOT DETAILS</SectionLabel>
        <Row>
          <Field label="Project Name" value={p.project} />
          <Field label="Location" value={p.location} />
        </Row>
        <div style={{ display: "flex", border: `1.5px solid ${RED}`, borderRadius: 4, margin: "8px 0 4px", overflow: "hidden" }}>
          <BoxCell label="Plot No." value={p.plotNo} />
          <BoxCell label="Sector" value={p.sector} />
          <BoxCell label="Total Area (sq. ft.)" value={p.totalSqft != null ? num(p.totalSqft) : ""} last />
        </div>

        {/* Payment Details */}
        <SectionLabel>PAYMENT DETAILS</SectionLabel>
        <Row>
          <Field label={pay.amountLabel} value={pay.amount ? num(pay.amount) : ""} />
          <Field label="Payment Mode" value={pay.mode} />
        </Row>
        <Row>
          <Field label="Amount in Words" value={pay.amount ? amountInWords(pay.amount) : ""} grow={3} />
          <Field label="Tentative Reg Date" value={pay.tentativeRegDate} grow={2} />
        </Row>
        {(pay.towards || pay.reference) && (
          <Row>
            <Field label="Received Towards" value={pay.towards} />
            <Field label="Reference" value={pay.reference} />
          </Row>
        )}
        {pay.totalValue != null && (
          <Row>
            <Field label="Total Plot Value ₹" value={num(pay.totalValue)} />
            <Field label="Paid to Date ₹" value={pay.paidToDate != null ? num(pay.paidToDate) : ""} />
            <Field label="Balance ₹" value={pay.balance != null ? num(pay.balance) : ""} />
          </Row>
        )}
        <Row>
          <Field label="Director Name & ID" value={pay.directorNameId} />
          <Field label="Partner Name & ID" value={pay.partnerNameId} />
        </Row>

        {/* Terms */}
        <div style={{ marginTop: 9, background: "#eef0fb", border: `1px solid ${NAVY}33`, borderRadius: 6, padding: "7px 12px" }}>
          <div style={{ fontWeight: 700, color: NAVY, marginBottom: 3, textAlign: "center" }}>நிபந்தனைகள்</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 10.5, color: "#222", lineHeight: 1.5 }}>
            {TERMS.map((t, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{t}</li>
            ))}
          </ol>
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, textAlign: "center", color: NAVY, fontWeight: 600 }}>
          பத்திரப்பதிவின்போது இந்த ரசீது திரும்பப் பெறப்படும்.
        </div>
        <div style={{ marginTop: 2, fontSize: 10, textAlign: "center", color: "#222" }}>
          மேற்கண்ட நிபந்தனைகளை முழுமையாகப் படித்து, புரிந்துகொண்டு, ஏற்றுக்கொண்டு, எனது முழு சம்மதத்துடன் மனையை
          முன்பதிவு செய்து கொள்கிறேன்.
        </div>

        {/* Signatures */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, textAlign: "center" }}>
          <div style={{ width: 200 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: NAVY, marginBottom: 26, lineHeight: 1.35 }}>
              THIS IS AN AUTOMATICALLY
              <br />
              GENERATED BILLING DOCUMENT.
              <br />
              AUTHORIZED SIGNATORY IS NOT REQUIRED.
            </div>
            <div style={{ borderTop: "1px solid #444", paddingTop: 4, fontWeight: 600, fontSize: 12 }}>
              Authorised Signatory
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 150, height: 64, border: "1px solid #999", borderRadius: 4, margin: "0 auto 4px" }} />
            <div style={{ fontWeight: 600, fontSize: 12 }}>For Office Use</div>
          </div>
          <div style={{ width: 200 }}>
            <div style={{ height: 84 }} />
            <div style={{ borderTop: "1px solid #444", paddingTop: 4, fontWeight: 600, fontSize: 12 }}>
              Customer Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
