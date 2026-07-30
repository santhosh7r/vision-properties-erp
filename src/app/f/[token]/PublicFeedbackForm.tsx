"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  isVisible,
  type FeedbackAnswers,
  type FeedbackForm,
  type FeedbackQuestion,
} from "@/lib/feedback";
import { submitFeedback, type SubmitFeedbackState } from "./actions";

/**
 * The customer-facing form. Rendered from the stored question list, so whatever
 * Admin configures is what gets asked — no hardcoded questions.
 *
 * Answers are held in state (not left to the DOM) because branch questions
 * appear and disappear as the controlling answer changes.
 */
export default function PublicFeedbackForm({
  token,
  form,
}: {
  token: string;
  form: FeedbackForm;
}) {
  const [state, formAction] = useActionState<SubmitFeedbackState | undefined, FormData>(
    submitFeedback,
    undefined,
  );
  const [answers, setAnswers] = useState<FeedbackAnswers>({});

  function set(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  if (state?.ok) {
    return (
      <div className="card text-center">
        <div className="text-4xl">🙏</div>
        <h1 className="mt-3 text-lg font-semibold">Thank you!</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {form.thank_you ??
            "Thank you for visiting Vision Properties. Your feedback helps us serve you better."}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div>
        <h1 className="text-lg font-semibold">{form.title}</h1>
        {form.intro && <p className="mt-1 text-sm text-[var(--muted)]">{form.intro}</p>}
      </div>

      {form.questions.map((q, i) =>
        isVisible(q, answers) ? (
          <Question key={q.id} q={q} index={i} value={answers[q.id] ?? ""} onChange={set} />
        ) : null,
      )}

      {state?.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Sending…">
        Submit feedback
      </SubmitButton>
    </form>
  );
}

function Question({
  q,
  index,
  value,
  onChange,
}: {
  q: FeedbackQuestion;
  index: number;
  value: string;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <div className="card">
      <p className="text-sm font-medium">
        {index + 1}. {q.label}
        {q.required && <span className="text-[var(--brand-red)]"> *</span>}
      </p>

      {q.type === "choice" ? (
        // Big tap targets — this is opened on a phone from a WhatsApp message.
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(q.options ?? []).map((o) => {
            const picked = value === o.value;
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => onChange(q.id, o.value)}
                className="flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm transition-colors"
                style={{
                  borderColor: picked ? "var(--accent)" : "var(--border)",
                  background: picked ? "var(--accent-soft)" : "transparent",
                  color: picked ? "var(--accent)" : "var(--text)",
                  fontWeight: picked ? 600 : 400,
                }}
                aria-pressed={picked}
              >
                {o.emoji && <span className="text-lg">{o.emoji}</span>}
                {o.label}
              </button>
            );
          })}
          <input type="hidden" name={`q:${q.id}`} value={value} />
        </div>
      ) : (
        <textarea
          name={`q:${q.id}`}
          rows={3}
          className="input mt-3"
          placeholder="Type your answer…"
          value={value}
          onChange={(e) => onChange(q.id, e.target.value)}
        />
      )}
    </div>
  );
}
