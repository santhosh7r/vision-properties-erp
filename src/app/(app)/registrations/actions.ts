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

  await logAudit(actor, "registration", data.id, "register", register_number);
  await notify(booking_id, "sms", null, `Plot registered. Registration No: ${register_number}, dated ${register_date}.`);

  redirect("/registrations");
}
