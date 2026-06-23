import type { Role } from "./roles";

// Mirror of the Postgres enums / tables for type-safe data access.

export type ApprovalType = "dtcp_rera" | "dtcp_only";
export type ProjectType = "affordable" | "luxury";
export type ProjectStatus = "draft" | "active" | "on_hold" | "closed";
export type PlotStatus =
  | "available"
  | "blocked"
  | "booked"
  | "registered"
  | "sold"
  | "cancelled";
export type BookMode = "blocking" | "booking";
export type BookingStatus = "pending" | "confirmed" | "cancelled";
export type PaymentStatus = "pending" | "completed";
export type PaymentKind = "blocking" | "advance" | "installment" | "final";
export type LoanTokenBy = "customer" | "director";

export interface User {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  role: Role;
  partner_code: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  district: string;
  city: string;
  remarks: string | null;
  area: string;
  land_type: string;
  approval_type: ApprovalType;
  project_type: ProjectType;
  status: ProjectStatus;
  // §1–§2 blocking & advance
  blocking_amount: number;
  blocking_window_hours: number;
  advance_percent: number;
  advance_min_amount: number;
  booking_window_days: number;
  // §3 cancellation & refund
  cancel_full_refund_days: number;
  cancellation_charge: number;
  refund_processing_days: number;
  // §7 transfer
  transfer_charge: number;
  created_by: string | null;
  created_at: string;
}

export type RefundStatus = "none" | "pending_approval" | "approved" | "paid";
export type TransferKind = "upgrade" | "lateral" | "downgrade";

export interface PlotTransfer {
  id: string;
  booking_id: string;
  from_plot_id: string;
  to_plot_id: string;
  from_value: number;
  to_value: number;
  kind: TransferKind;
  charge: number;
  remarks: string | null;
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlotCategory {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Plot {
  id: string;
  project_id: string;
  plot_category_id: string | null;
  block: string | null;
  plot_no: string;
  sqft: number;
  price_per_sqft: number;
  description: string | null;
  status: PlotStatus;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  dob: string | null;
  street: string | null;
  area: string | null;
  pincode: string | null;
  state: string | null;
  district: string | null;
  country: string | null;
  occupation: string | null;
  occupation_remarks: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  plot_id: string;
  customer_id: string;
  project_id: string;
  block: string | null;
  plot_sqft: number | null;
  total_plot_value: number;
  nominee_name: string | null;
  nominee_mobile: string | null;
  nominee_relationship: string | null;
  partner_id: string | null;
  partner_code: string | null;
  partner_name: string | null;
  senior_director_id: string | null;
  senior_director_code: string | null;
  senior_director_name: string | null;
  director_id: string | null;
  director_code: string | null;
  director_name: string | null;
  tentative_registration_date: string | null;
  mode_of_payment: string | null;
  loan_token_by: LoanTokenBy | null;
  booked_date: string | null;
  remarks: string | null;
  book_mode: BookMode;
  blocking_amount: number;
  advance_required: number;
  advance_paid: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  expires_at: string | null;
  released_at: string | null;
  // §3 cancellation & refund
  cancellation_reason: string | null;
  cancellation_charge: number | null;
  refund_amount: number | null;
  refund_status: RefundStatus;
  refund_approved_by: string | null;
  refund_approved_at: string | null;
  refund_due_date: string | null;
  refund_paid_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  kind: PaymentKind;
  mode: string | null;
  status: PaymentStatus;
  paid_at: string;
  recorded_by: string | null;
  created_at: string;
}

export interface Registration {
  id: string;
  booking_id: string | null;
  plot_id: string;
  project_id: string;
  block: string | null;
  plot_sqft: number | null;
  register_date: string;
  register_number: string;
  name_of_registrant: string;
  mobile: string | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
}

export type CabRequestStatus = "pending" | "approved" | "declined";

export interface CabRequest {
  id: string;
  customer_id: string;
  requested_by: string | null;
  cab_date: string;          // the date the cab is requested for
  pickup: string | null;
  notes: string | null;
  status: CabRequestStatus;
  decline_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}
