// ============================================================================
// Site Visit Feedback — form definition + answer helpers.
//
// The questions are DATA, not code: Admin edits them in the panel and they are
// stored on feedback_forms.questions (jsonb). Everything here works against that
// shape, so adding or renaming a question never needs a code change. Pure —
// safe on both client and server.
// ============================================================================

export type FeedbackQuestionType = "choice" | "text";

export interface FeedbackOption {
  value: string;
  label: string;
  emoji?: string;
}

export interface FeedbackQuestion {
  id: string;
  label: string;
  type: FeedbackQuestionType;
  required: boolean;
  /** Choice questions only. */
  options?: FeedbackOption[];
  /**
   * Show this question only when another answer matches — how "if no, what did
   * we miss?" and "if yes, why did you choose us?" hang off the purchase
   * question instead of both being asked.
   */
  showIf?: { questionId: string; equals: string };
}

export interface FeedbackForm {
  id: string;
  title: string;
  intro: string | null;
  thank_you: string | null;
  questions: FeedbackQuestion[];
  is_active: boolean;
  updated_at: string;
}

export type FeedbackAnswers = Record<string, string>;

/** How long after the visit the feedback becomes due. */
export const FEEDBACK_DELAY_HOURS = 6;
export const FEEDBACK_DELAY_MS = FEEDBACK_DELAY_HOURS * 60 * 60 * 1000;

// The rating scale used by the printed sheet — offered as a one-click preset in
// the editor so Admin need not retype four options every time.
export const RATING_OPTIONS: FeedbackOption[] = [
  { value: "excellent", label: "Excellent", emoji: "⭐" },
  { value: "good", label: "Good", emoji: "👍" },
  { value: "average", label: "Average", emoji: "😐" },
  { value: "poor", label: "Poor", emoji: "👎" },
];

export const YES_NO_OPTIONS: FeedbackOption[] = [
  { value: "yes", label: "Yes", emoji: "✅" },
  { value: "no", label: "No", emoji: "❌" },
];

/**
 * Is this question visible given the answers so far? A branch whose controlling
 * question is unanswered stays hidden.
 */
export function isVisible(q: FeedbackQuestion, answers: FeedbackAnswers): boolean {
  if (!q.showIf) return true;
  return answers[q.showIf.questionId] === q.showIf.equals;
}

/** The questions actually being asked right now, in order. */
export function visibleQuestions(
  questions: FeedbackQuestion[],
  answers: FeedbackAnswers,
): FeedbackQuestion[] {
  return questions.filter((q) => isVisible(q, answers));
}

/**
 * Validate a submission. Only VISIBLE questions are enforced — a required
 * branch that was never shown must not block the form. Returns the id of the
 * first offending question, or null when the submission is good.
 */
export function firstMissingAnswer(
  questions: FeedbackQuestion[],
  answers: FeedbackAnswers,
): string | null {
  for (const q of visibleQuestions(questions, answers)) {
    if (!q.required) continue;
    if (!String(answers[q.id] ?? "").trim()) return q.id;
  }
  return null;
}

/**
 * Drop answers to questions that are not visible (or no longer exist), so a
 * branch the customer filled in and then navigated away from is not stored.
 * Choice answers are checked against their option list.
 */
export function cleanAnswers(
  questions: FeedbackQuestion[],
  answers: FeedbackAnswers,
): FeedbackAnswers {
  const out: FeedbackAnswers = {};
  for (const q of visibleQuestions(questions, answers)) {
    const raw = String(answers[q.id] ?? "").trim();
    if (!raw) continue;
    if (q.type === "choice") {
      if (!(q.options ?? []).some((o) => o.value === raw)) continue;
    }
    out[q.id] = raw;
  }
  return out;
}

/** Human-readable answer for a card / table cell. */
export function answerLabel(q: FeedbackQuestion, value: string | undefined): string {
  if (!value) return "—";
  if (q.type !== "choice") return value;
  const opt = (q.options ?? []).find((o) => o.value === value);
  if (!opt) return value;
  return opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label;
}

/** A URL-safe random token for the one-time /f/<token> link. */
export function makeFeedbackToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalise a label into a stable question id when Admin adds a question. */
export function nextQuestionId(existing: FeedbackQuestion[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((q) => q.id));
  while (taken.has(`q${n}`)) n++;
  return `q${n}`;
}
