"use server";

import { getSupabase } from "@/lib/supabase";
import {
  cleanAnswers,
  firstMissingAnswer,
  type FeedbackAnswers,
  type FeedbackQuestion,
} from "@/lib/feedback";

export interface SubmitFeedbackState {
  error?: string;
  ok?: boolean;
}

/**
 * Public submission — no session. The token IS the authorisation: it is a random
 * 36-hex-char secret tied to one site visit, and the row it points at is the
 * only row that can be written. Everything else (which questions, whether it was
 * already answered) is read from the database rather than trusted from the form.
 */
export async function submitFeedback(
  _prev: SubmitFeedbackState | undefined,
  formData: FormData,
): Promise<SubmitFeedbackState> {
  const token = String(formData.get("token") || "").trim();
  if (!token) return { error: "This feedback link is not valid." };

  const sb = getSupabase();
  const { data: fr } = await sb
    .from("feedback_requests")
    .select("id, responded_at, form_id")
    .eq("token", token)
    .maybeSingle();
  if (!fr) return { error: "This feedback link is not valid or has expired." };
  if (fr.responded_at) return { error: "This feedback has already been submitted." };

  // Validate against the form the link was issued for, falling back to whatever
  // is active — so a form deleted mid-flight cannot strand a customer.
  const { data: form } = fr.form_id
    ? await sb.from("feedback_forms").select("questions").eq("id", fr.form_id).maybeSingle()
    : await sb.from("feedback_forms").select("questions").eq("is_active", true).maybeSingle();
  const questions = ((form?.questions ?? []) as FeedbackQuestion[]) ?? [];

  const answers: FeedbackAnswers = {};
  for (const q of questions) {
    const v = formData.get(`q:${q.id}`);
    if (v !== null) answers[q.id] = String(v);
  }

  const missing = firstMissingAnswer(questions, answers);
  if (missing) {
    const q = questions.find((x) => x.id === missing);
    return { error: `Please answer: ${q?.label ?? "all required questions"}` };
  }

  const { error } = await sb
    .from("feedback_requests")
    .update({ answers: cleanAnswers(questions, answers), responded_at: new Date().toISOString() })
    .eq("id", fr.id)
    .is("responded_at", null); // never overwrite an answer already given
  if (error) return { error: "Could not save your feedback. Please try again." };

  return { ok: true };
}
