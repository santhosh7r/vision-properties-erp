"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit, notify } from "@/lib/audit";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
}
function nullable(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

export async function createRegistration(formData: FormData): Promise<void> {
  const actor = await requireCapability("manage_registration");
  const sb = getSupabase();

  const booking_id = s(formData.get("booking_id")) || null;
  const plot_id = s(formData.get("plot_id"));
  const project_id = s(formData.get("project_id"));
  const register_date = s(formData.get("register_date"));
  const register_number = s(formData.get("register_number"));
  const name_of_registrant = s(formData.get("name_of_registrant"));

  if (!plot_id || !project_id || !register_date || !register_number || !name_of_registrant) return;

  // A cancelled booking is dead — never register it (that would orphan a
  // registration against a cancelled booking with no sales chain, so no
  // Director/Senior Director coupons could be resolved). Guards the reverse of
  // cancelBooking's already-registered check.
  if (booking_id) {
    const { data: bkStatus } = await sb
      .from("bookings")
      .select("status")
      .eq("id", booking_id)
      .maybeSingle();
    if (bkStatus?.status === "cancelled") redirect(`/bookings/${booking_id}`);
  }

  const { data, error } = await sb
    .from("registrations")
    .insert({
      booking_id,
      plot_id,
      project_id,
      plot_sqft: Number(formData.get("plot_sqft") || 0) || null,
      register_date,
      register_number,
      name_of_registrant,
      mobile: s(formData.get("mobile")) || null,
      remarks: s(formData.get("remarks")) || null,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error || !data) return;

  // Plot is now registered/sold; the booking is confirmed.
  await sb.from("plots").update({ status: "registered" }).eq("id", plot_id);
  const mode = nullable(formData.get("mode"));
  const loan_token_by = nullable(formData.get("loan_token_by"));
  if (booking_id) {
    await sb
      .from("bookings")
      .update({ status: "confirmed", expires_at: null, mode_of_payment: mode, loan_token_by })
      .eq("id", booking_id);

    // Record the amount collected at registration to the ledger, then refresh
    // the booking's paid total / payment status from all completed payments.
    const amount = Number(formData.get("amount") || 0);
    if (amount > 0) {
      await sb.from("payments").insert({
        booking_id,
        amount,
        kind: "final",
        mode,
        reference: nullable(formData.get("reference")),
        bank_name: nullable(formData.get("bank_name")),
        instrument_date: nullable(formData.get("instrument_date")),
        status: "completed",
        recorded_by: actor.id,
      });
      const { data: pays } = await sb
        .from("payments")
        .select("amount")
        .eq("booking_id", booking_id)
        .eq("status", "completed");
      const paid = (pays ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
      const { data: bk } = await sb
        .from("bookings")
        .select("total_plot_value")
        .eq("id", booking_id)
        .maybeSingle();
      const total = Number(bk?.total_plot_value || 0);
      await sb
        .from("bookings")
        .update({ advance_paid: paid, payment_status: total > 0 && paid >= total ? "completed" : "pending" })
        .eq("id", booking_id);
      await logAudit(actor, "payment", booking_id, "record", `₹${amount} (final · registration)`);
    }
  }

  // Auto-issue coupons / tokens (value-based, ₹) on registration to the Director
  // and Senior Director resolved on the booking's sales chain. These rewards are
  // ONLY for Director and Senior Director — never for the Business Manager /
  // Business Partner who actually walked the deal. Because the booking already
  // stores the governing `director_id` and `senior_director_id` (walked up the
  // manager chain at booking time), a plot booked under a Manager or Partner ID
  // still credits their upline Director + Senior Director; a plot booked under a
  // Director's ID credits that Director (+ any SD above); a plot booked under a
  // Senior Director's ID credits that SD.
  //
  // Each rate is ₹ per sq.ft, so value = rate × plot sq.ft. Per project config:
  //   Director        → Gold + Digital token + Tools
  //   Senior Director → Gold + Tools   (no Digital token rate exists for an SD)
  const sqft = Number(formData.get("plot_sqft") || 0) || 0;
  if (booking_id && sqft > 0) {
    const [{ data: proj }, { data: bk }] = await Promise.all([
      sb
        .from("projects")
        .select(
          "director_gold_coupon, director_digital_coupon, director_tools_coupon, senior_director_gold_coupon, senior_director_tools_coupon",
        )
        .eq("id", project_id)
        .maybeSingle(),
      sb
        .from("bookings")
        .select("director_id, senior_director_id")
        .eq("id", booking_id)
        .maybeSingle(),
    ]);
    const value = (rate: unknown) => Math.round(Number(rate || 0) * sqft * 100) / 100;
    const dir = bk?.director_id ?? null;
    const sd = bk?.senior_director_id ?? null;

    const rows = [
      { uid: dir, type: "gold", value: value(proj?.director_gold_coupon) },
      { uid: dir, type: "digital", value: value(proj?.director_digital_coupon) },
      { uid: dir, type: "tools", value: value(proj?.director_tools_coupon) },
      { uid: sd, type: "gold", value: value(proj?.senior_director_gold_coupon) },
      { uid: sd, type: "tools", value: value(proj?.senior_director_tools_coupon) },
    ].filter((r) => r.uid && r.value > 0) as { uid: string; type: string; value: number }[];

    if (rows.length) {
      await sb.from("coupons").insert(
        rows.map((r) => ({
          user_id: r.uid,
          type: r.type,
          quantity: 0,
          value: r.value,
          source: "auto",
          note: `${r.type === "digital" ? "Digital token" : `${r.type[0].toUpperCase()}${r.type.slice(1)} coupon`} · registration ${register_number}`,
          issued_by: actor.id,
        })),
      );
    }
  }

  await logAudit(actor, "registration", data.id, "register", register_number);
  await notify(booking_id, "sms", null, `Plot registered. Registration No: ${register_number}, dated ${register_date}.`);

  redirect("/registrations");
}
