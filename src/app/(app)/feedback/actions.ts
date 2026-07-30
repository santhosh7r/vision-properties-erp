"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { requireCapability } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { FeedbackQuestion } from "@/lib/feedback";

export interface SaveFormState {
  error?: string;
  ok?: boolean;
}

/**
 * Save the feedback form definition. ADMIN ONLY (`manage_users` is
 * admin-exclusive) — Senior Directors may read their team's responses but never
 * change the questions.
 *
 * The whole definition arrives as JSON from the editor and is re-validated here:
 * a hand-crafted POST must not be able to store a malformed question list that
 * would then break the public page for every customer.
 */
export async function saveFeedbackForm(
  _prev: SaveFormState | undefined,
  formData: FormData,
): Promise<SaveFormState> {
  const actor = await requireCapability("manage_users");
  const sb = getSupabase();

  const id = String(formData.get("id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const intro = String(formData.get("intro") || "").trim() || null;
  const thank_you = String(formData.get("thank_you") || "").trim() || null;
  if (!title) return { error: "The form needs a title." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("questions") || "[]"));
  } catch {
    return { error: "The questions could not be read. Please reload and try again." };
  }
  if (!Array.isArray(parsed)) return { error: "The questions could not be read." };

  const seen = new Set<string>();
  const questions: FeedbackQuestion[] = [];
  for (const raw of parsed as Record<string, unknown>[]) {
    const qid = String(raw?.id ?? "").trim();
    const label = String(raw?.label ?? "").trim();
    const type = raw?.type === "text" ? "text" : "choice";
    if (!qid || !label) return { error: "Every question needs a title." };
    if (seen.has(qid)) return { error: `Duplicate question id "${qid}".` };
    seen.add(qid);

    const options = Array.isArray(raw?.options)
      ? (raw.options as Record<string, unknown>[])
          .map((o) => ({
            value: String(o?.value ?? "").trim(),
            label: String(o?.label ?? "").trim(),
            emoji: String(o?.emoji ?? "").trim() || undefined,
          }))
          .filter((o) => o.value && o.label)
      : [];
    if (type === "choice" && options.length === 0) {
      return { error: `"${label}" is a choice question but has no options.` };
    }

    const showIfRaw = raw?.showIf as Record<string, unknown> | undefined;
    const showIf =
      showIfRaw && String(showIfRaw.questionId ?? "").trim()
        ? {
            questionId: String(showIfRaw.questionId).trim(),
            equals: String(showIfRaw.equals ?? "").trim(),
          }
        : undefined;
    // A branch may only depend on a question ASKED EARLIER, otherwise the
    // condition can never be evaluated by the time the question is rendered.
    if (showIf && !seen.has(showIf.questionId)) {
      return { error: `"${label}" depends on a question that comes after it.` };
    }

    questions.push({
      id: qid,
      label,
      type,
      required: raw?.required === true,
      ...(type === "choice" ? { options } : {}),
      ...(showIf ? { showIf } : {}),
    });
  }

  if (questions.length === 0) return { error: "Add at least one question." };

  const payload = {
    title,
    intro,
    thank_you,
    questions,
    updated_by: actor.id,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await sb.from("feedback_forms").update(payload).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await sb.from("feedback_forms").insert({ ...payload, is_active: true });
    if (error) return { error: error.message };
  }

  await logAudit(actor, "feedback_form", id || null, "update", title);
  revalidatePath("/feedback");
  return { ok: true };
}
