// Select-field option lists used across forms (board: "(Select)" fields).

export const LAND_TYPES = [
  "Residential",
  "Commercial",
  "Agricultural",
  "Mixed Use",
  "Industrial",
];

export const APPROVAL_TYPES: { value: "dtcp_rera" | "dtcp_only"; label: string }[] = [
  { value: "dtcp_rera", label: "DTCP + RERA" },
  { value: "dtcp_only", label: "DTCP Only" },
];

export const PROJECT_TYPES: { value: "affordable" | "luxury"; label: string }[] = [
  { value: "affordable", label: "Affordable Project" },
  { value: "luxury", label: "Luxury Project" },
];

export const OCCUPATIONS = [
  "Salaried",
  "Self Employed",
  "Business Owner",
  "Government Employee",
  "Professional",
  "Retired",
  "Other",
];

export const NOMINEE_RELATIONSHIPS = [
  "Spouse",
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Other",
];

export const PAYMENT_MODES = [
  "Cash",
  "Cheque",
  "Bank Transfer",
  "UPI",
  "Home Loan",
  "Other",
];

// Instrument details captured per payment mode. Persisted into three reusable
// payments columns (reference / bank_name / instrument_date — migration 0020);
// the form renders only the fields listed for the currently-selected mode.
export interface PaymentModeField {
  name: "reference" | "bank_name" | "instrument_date";
  label: string;
  type: "text" | "date";
  required?: boolean;
  placeholder?: string;
}

export const PAYMENT_MODE_FIELDS: Record<string, PaymentModeField[]> = {
  Cash: [],
  Cheque: [
    { name: "reference", label: "Cheque Number", type: "text", required: true, placeholder: "e.g. 000123" },
    { name: "bank_name", label: "Bank Name", type: "text", required: true, placeholder: "e.g. HDFC Bank" },
    { name: "instrument_date", label: "Cheque Date", type: "date" },
  ],
  "Bank Transfer": [
    { name: "reference", label: "Transaction Ref / UTR", type: "text", required: true, placeholder: "UTR / reference no." },
    { name: "bank_name", label: "Bank Name", type: "text", placeholder: "e.g. ICICI Bank" },
  ],
  UPI: [
    { name: "reference", label: "UPI Transaction ID", type: "text", required: true, placeholder: "12-digit UPI txn id" },
  ],
  "Home Loan": [
    { name: "bank_name", label: "Lender / Bank", type: "text", required: true, placeholder: "e.g. SBI Home Loans" },
    { name: "reference", label: "Sanction / Ref No.", type: "text", placeholder: "loan account / sanction no." },
  ],
  Other: [
    { name: "reference", label: "Reference / Note", type: "text", placeholder: "transaction reference" },
  ],
};

export function paymentModeFields(mode: string | null | undefined): PaymentModeField[] {
  return (mode && PAYMENT_MODE_FIELDS[mode]) || [];
}

// Coupon / token types an admin can issue to a salesperson (migration 0011).
export const COUPON_TYPES: { value: string; label: string }[] = [
  { value: "cab", label: "Cab Token" },
  { value: "tools", label: "Tools Coupon" },
  { value: "digital", label: "Digital Coupon" },
  { value: "gold", label: "Gold Coupon" },
];

// Tools, Gold and Digital coupons are tracked by ₹ VALUE — auto-issued per sq.ft
// on registration (project rate × plot sq.ft) and redeemable in any denomination.
// Cab tokens are whole tokens counted by quantity (e.g. one cab ride). Value
// coupons display & redeem in rupees.
export const VALUE_COUPON_TYPES = ["tools", "gold", "digital"];
export function isValueCoupon(type: string): boolean {
  return VALUE_COUPON_TYPES.includes(type);
}

// The single, app-wide district master. District is always a fixed dropdown —
// never a free-text field — and these are the only selectable values everywhere
// (bookings, customers, projects, users, profile). Add more here when needed.
export const DISTRICTS = ["Chennai", "Trichy"];

// Who took the home loan — captured only when the payment mode is a loan. The
// customer, or (for a director-arranged loan) their Senior Director.
export const LOAN_TOKEN_BY_OPTIONS: { value: "customer" | "senior_director"; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "senior_director", label: "Senior Director" },
];

export function loanTokenByLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (
    LOAN_TOKEN_BY_OPTIONS.find((o) => o.value === v)?.label ??
    v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export const INDIAN_STATES = [
  "Tamil Nadu",
  "Karnataka",
  "Andhra Pradesh",
  "Telangana",
  "Kerala",
  "Maharashtra",
  "Puducherry",
  "Other",
];
