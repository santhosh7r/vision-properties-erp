"use client";

import { useActionState, useMemo, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  answerLabel,
  nextQuestionId,
  RATING_OPTIONS,
  YES_NO_OPTIONS,
  type FeedbackForm,
  type FeedbackQuestion,
} from "@/lib/feedback";
import { saveFeedbackForm, type SaveFormState } from "./actions";

export interface FeedbackRow {
  id: string;
  token: string;
  customer: string | null;
  phone: string | null;
  project: string | null;
  raisedBy: string | null;
  visitDate: string | null;
  visitTime: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  answers: Record<string, string> | null;
}

export default function FeedbackWorkspace({
  rows,
  form,
  canEdit,
  migrationMissing,
}: {
  rows: FeedbackRow[];
  form: FeedbackForm | null;
  canEdit: boolean;
  migrationMissing: boolean;
}) {
  const [tab, setTab] = useState<"responses" | "form">("responses");

  if (migrationMissing) {
    return (
      <EmptyState
        message="Feedback isn’t available yet."
        hint="Apply migration 0027_site_visit_feedback.sql to your database, then refresh."
      />
    );
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip label={`Responses (${rows.filter((r) => r.respondedAt).length})`} active={tab === "responses"} onClick={() => setTab("responses")} />
          <Chip label="Customise form" active={tab === "form"} onClick={() => setTab("form")} />
        </div>
      )}

      {tab === "responses" || !canEdit ? (
        <Responses rows={rows} form={form} />
      ) : (
        <FormEditor form={form} />
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--muted)",
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// RESPONSES
// ---------------------------------------------------------------------------
function Responses({ rows, form }: { rows: FeedbackRow[]; form: FeedbackForm | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const questions = form?.questions ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        message="No feedback yet."
        hint="A feedback link is created when Admin gives a site visit its final approval."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.customer ?? "—"}</span>
                  {r.phone && <span className="font-mono text-xs text-[var(--muted)]">{r.phone}</span>}
                  <StatusBadge row={r} />
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {r.project ?? "—"}
                  {r.visitDate && ` · visited ${fmtDate(r.visitDate)}`}
                  {r.visitTime && ` at ${r.visitTime.slice(0, 5)}`}
                  {r.raisedBy && ` · raised by ${r.raisedBy}`}
                </p>
              </div>
              {r.respondedAt && (
                <button
                  type="button"
                  className="text-xs text-[var(--accent)]"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                >
                  {isOpen ? "Hide answers" : "View answers"}
                </button>
              )}
            </div>

            {isOpen && r.answers && (
              <dl className="mt-3 space-y-2 border-t pt-3 text-sm">
                {questions.map((q) =>
                  r.answers?.[q.id] ? (
                    <div key={q.id}>
                      <dt className="text-xs text-[var(--muted)]">{q.label}</dt>
                      <dd className="text-[var(--text-2)]">{answerLabel(q, r.answers[q.id])}</dd>
                    </div>
                  ) : null,
                )}
                <div className="pt-1 text-[11px] text-[var(--muted)]">
                  Submitted {fmtDateTime(r.respondedAt)}
                </div>
              </dl>
            )}

            {!r.respondedAt && (
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                {r.scheduledFor ? `Due ${fmtDateTime(r.scheduledFor)}` : "Not scheduled"}
                {" · "}
                <span className="font-mono">/f/{r.token}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ row }: { row: FeedbackRow }) {
  if (row.respondedAt) return <Badge tone="green">Answered</Badge>;
  if (row.sentAt) return <Badge tone="amber">Sent, awaiting reply</Badge>;
  return <Badge tone="gray">Not sent</Badge>;
}

// ---------------------------------------------------------------------------
// FORM EDITOR — Admin only.
// ---------------------------------------------------------------------------
function FormEditor({ form }: { form: FeedbackForm | null }) {
  const [state, formAction] = useActionState<SaveFormState | undefined, FormData>(
    saveFeedbackForm,
    undefined,
  );
  const [title, setTitle] = useState(form?.title ?? "Site Visit Feedback");
  const [intro, setIntro] = useState(form?.intro ?? "");
  const [thankYou, setThankYou] = useState(form?.thank_you ?? "");
  const [questions, setQuestions] = useState<FeedbackQuestion[]>(form?.questions ?? []);

  function update(i: number, patch: Partial<FeedbackQuestion>) {
    setQuestions((qs) => qs.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  }
  function move(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, n) => n !== i));
  }
  function add(type: "choice" | "text") {
    setQuestions((qs) => [
      ...qs,
      {
        id: nextQuestionId(qs),
        label: "",
        type,
        required: type === "choice",
        ...(type === "choice" ? { options: RATING_OPTIONS } : {}),
      },
    ]);
  }

  // Only questions ABOVE a given one can control its branch — a condition on a
  // later answer could never be evaluated in time.
  const earlier = (i: number) => questions.slice(0, i);
  const serialised = useMemo(() => JSON.stringify(questions), [questions]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={form?.id ?? ""} />
      <input type="hidden" name="questions" value={serialised} />

      <div className="card space-y-3">
        <div>
          <label className="label">Form title *</label>
          <input name="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">Intro text</label>
          <textarea name="intro" rows={2} className="input" value={intro} onChange={(e) => setIntro(e.target.value)} />
        </div>
        <div>
          <label className="label">Thank-you message</label>
          <textarea name="thank_you" rows={2} className="input" value={thankYou} onChange={(e) => setThankYou(e.target.value)} />
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="card space-y-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">
              Question {i + 1} · <span className="font-mono">{q.id}</span>
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[var(--accent)] disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-[var(--accent)] disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(i)} className="text-red-400">Remove</button>
            </div>
          </div>

          <div>
            <label className="label">Question *</label>
            <input className="input" value={q.label} onChange={(e) => update(i, { label: e.target.value })} required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Answer type</label>
              <select
                className="select"
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as "choice" | "text";
                  update(i, { type, options: type === "choice" ? (q.options ?? RATING_OPTIONS) : undefined });
                }}
              >
                <option value="choice">Multiple choice</option>
                <option value="text">Free text</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                Required
              </label>
            </div>
          </div>

          {q.type === "choice" && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="label">Options</label>
                <span className="flex gap-2 text-[11px]">
                  <button type="button" className="text-[var(--accent)]" onClick={() => update(i, { options: RATING_OPTIONS })}>
                    Use rating scale
                  </button>
                  <button type="button" className="text-[var(--accent)]" onClick={() => update(i, { options: YES_NO_OPTIONS })}>
                    Use Yes / No
                  </button>
                </span>
              </div>
              <OptionsEditor
                options={q.options ?? []}
                onChange={(options) => update(i, { options })}
              />
            </div>
          )}

          {earlier(i).length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Only ask if…</label>
                <select
                  className="select"
                  value={q.showIf?.questionId ?? ""}
                  onChange={(e) =>
                    update(i, {
                      showIf: e.target.value
                        ? { questionId: e.target.value, equals: q.showIf?.equals ?? "" }
                        : undefined,
                    })
                  }
                >
                  <option value="">Always ask</option>
                  {earlier(i).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label || p.id}
                    </option>
                  ))}
                </select>
              </div>
              {q.showIf?.questionId && (
                <div>
                  <label className="label">…is answered</label>
                  <select
                    className="select"
                    value={q.showIf.equals}
                    onChange={(e) =>
                      update(i, { showIf: { questionId: q.showIf!.questionId, equals: e.target.value } })
                    }
                  >
                    <option value="">Select…</option>
                    {(questions.find((p) => p.id === q.showIf!.questionId)?.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => add("choice")}>+ Multiple choice</button>
        <button type="button" className="btn-ghost" onClick={() => add("text")}>+ Free text</button>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          Form saved. New feedback links will use it right away.
        </p>
      )}

      <SubmitButton className="btn-primary" pendingLabel="Saving…">Save form</SubmitButton>
    </form>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string; emoji?: string }[];
  onChange: (o: { value: string; label: string; emoji?: string }[]) => void;
}) {
  function set(i: number, patch: Partial<{ value: string; label: string; emoji: string }>) {
    onChange(options.map((o, n) => (n === i ? { ...o, ...patch } : o)));
  }
  return (
    <div className="mt-1 space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="input"
            style={{ width: 60, textAlign: "center" }}
            value={o.emoji ?? ""}
            placeholder="🙂"
            onChange={(e) => set(i, { emoji: e.target.value })}
            aria-label="Emoji"
          />
          <input
            className="input flex-1"
            value={o.label}
            placeholder="Label shown to the customer"
            onChange={(e) =>
              // Keep the stored value in step with the label until it is edited
              // directly — saves typing a slug for every option.
              set(i, {
                label: e.target.value,
                value: o.value || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              })
            }
          />
          <button type="button" className="text-xs text-red-400" onClick={() => onChange(options.filter((_, n) => n !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-xs text-[var(--accent)]"
        onClick={() => onChange([...options, { value: "", label: "" }])}
      >
        + Add option
      </button>
    </div>
  );
}
