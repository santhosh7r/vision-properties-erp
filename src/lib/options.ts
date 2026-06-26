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

// Coupon / token types an admin can issue to a salesperson (migration 0011).
export const COUPON_TYPES: { value: string; label: string }[] = [
  { value: "cab", label: "Cab Token" },
  { value: "tools", label: "Tools Coupon" },
  { value: "digital", label: "Digital Coupon" },
  { value: "gold", label: "Gold Coupon" },
];

// Tools coupons are tracked by ₹ VALUE — auto-issued per sq.ft on registration
// and redeemable in any denomination. The rest are whole tokens counted by
// quantity (e.g. one cab ride). Value coupons display & redeem in rupees.
export const VALUE_COUPON_TYPES = ["tools"];
export function isValueCoupon(type: string): boolean {
  return VALUE_COUPON_TYPES.includes(type);
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
