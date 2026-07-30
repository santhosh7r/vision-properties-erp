import { getSupabase } from "@/lib/supabase";
import type { FeedbackForm, FeedbackQuestion } from "@/lib/feedback";
import PublicFeedbackForm from "./PublicFeedbackForm";

export const dynamic = "force-dynamic";

/**
 * PUBLIC page — no session, reached from the WhatsApp link. Deliberately outside
 * the (app) group so it carries no sidebar, no header and no auth redirect; the
 * middleware does not guard /f either.
 *
 * The token is the only credential. An unknown or already-answered token gets a
 * neutral message rather than anything that would confirm what a valid token
 * looks like.
 */
export default async function FeedbackLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = getSupabase();

  const { data: fr } = await sb
    .from("feedback_requests")
    .select("id, form_id, customer_name, responded_at")
    .eq("token", token)
    .maybeSingle();

  const { data: formRow } = fr?.form_id
    ? await sb.from("feedback_forms").select("*").eq("id", fr.form_id).maybeSingle()
    : await sb.from("feedback_forms").select("*").eq("is_active", true).maybeSingle();

  const form: FeedbackForm | null = formRow
    ? {
        id: formRow.id as string,
        title: (formRow.title as string) ?? "Site Visit Feedback",
        intro: (formRow.intro as string | null) ?? null,
        thank_you: (formRow.thank_you as string | null) ?? null,
        questions: ((formRow.questions ?? []) as FeedbackQuestion[]) ?? [],
        is_active: !!formRow.is_active,
        updated_at: formRow.updated_at as string,
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <img
          src="/logo-mark.png"
          alt="Vision Properties"
          className="h-10 w-10 shrink-0 object-contain"
        />
        <p className="text-[15px] font-semibold leading-tight tracking-tight">
          <span style={{ color: "var(--brand-red)" }}>Vision</span>{" "}
          <span style={{ color: "var(--accent)" }}>Properties</span>
        </p>
      </div>

      {!fr || !form ? (
        <Notice
          emoji="🔗"
          title="This link isn’t valid"
          body="The feedback link may have expired or already been used. Please contact us if you would still like to share your feedback."
        />
      ) : fr.responded_at ? (
        <Notice
          emoji="🙏"
          title="Thank you!"
          body={
            form.thank_you ??
            "Thank you for visiting Vision Properties. Your feedback helps us serve you better."
          }
        />
      ) : (
        <>
          {fr.customer_name && (
            <p className="mb-4 text-sm text-[var(--muted)]">Hello {fr.customer_name} 👋</p>
          )}
          <PublicFeedbackForm token={token} form={form} />
        </>
      )}
    </div>
  );
}

function Notice({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="card text-center">
      <div className="text-4xl">{emoji}</div>
      <h1 className="mt-3 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}
