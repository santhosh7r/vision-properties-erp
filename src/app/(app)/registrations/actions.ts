"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit, notify } from "@/lib/audit";

function s(v: FormDataEntryValue | null): string {
  return String(v || "").trim();
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
  if (booking_id) {
    await sb
      .from("bookings")
      .update({ status: "confirmed", expires_at: null })
      .eq("id", booking_id);
  }

  // Auto-issue Tools Coupons (value-based, ₹) to the Director and the Senior
  // Director on the booking's sales chain, EACH at their own project rate:
  // value = role rate × plot sq.ft (e.g. ₹3000 on a 1200 sq.ft plot at ₹2.50/sq.ft).
  // Redeemable in any denomination by admin.
  const sqft = Number(formData.get("plot_sqft") || 0) || 0;
  if (booking_id && sqft > 0) {
    const [{ data: proj }, { data: bk }] = await Promise.all([
      sb.from("projects").select("director_tools_coupon, senior_director_tools_coupon").eq("id", project_id).maybeSingle(),
      sb.from("bookings").select("director_id, senior_director_id").eq("id", booking_id).maybeSingle(),
    ]);
    const dirValue = Math.round(Number(proj?.director_tools_coupon || 0) * sqft * 100) / 100;
    const sdValue = Math.round(Number(proj?.senior_director_tools_coupon || 0) * sqft * 100) / 100;
    const rows = [
      { uid: bk?.director_id, value: dirValue },
      { uid: bk?.senior_director_id, value: sdValue },
    ].filter((r) => r.uid && r.value > 0) as { uid: string; value: number }[];
    if (rows.length) {
      await sb.from("coupons").insert(
        rows.map((r) => ({
          user_id: r.uid,
          type: "tools",
          quantity: 0,
          value: r.value,
          source: "auto",
          note: `Tools coupon · registration ${register_number}`,
          issued_by: actor.id,
        })),
      );
    }
  }

  await logAudit(actor, "registration", data.id, "register", register_number);
  await notify(booking_id, "sms", null, `Plot registered. Registration No: ${register_number}, dated ${register_date}.`);

  redirect("/registrations");
}
