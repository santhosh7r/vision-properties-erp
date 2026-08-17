import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { getDownlineIds } from "@/lib/hierarchy";
import { getDistrictScope } from "@/lib/scope";
import { PRE_SALES_DESK_ROLES, type Role } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import type { FeedbackForm, FeedbackQuestion } from "@/lib/feedback";
import FeedbackWorkspace, { type FeedbackRow } from "./FeedbackWorkspace";

export const dynamic = "force-dynamic";

/**
 * Site Visit Feedback — Admin and Senior Director only.
 *   Admin           → every response, plus the form editor.
 *   Senior Director → their OWN TEAM's responses, read-only.
 * Anyone else is bounced; the nav hides it from them too.
 */
export default async function FeedbackPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  // Site visits are Pre-Sales work (they clear the "Pre-sales approval" stage on
  // the request), so the desk sees the feedback those visits produced — scoped
  // to its own district, the way every other desk screen is.
  const isPreSalesDesk = PRE_SALES_DESK_ROLES.includes(user.role as Role);
  if (!isAdmin && user.role !== "senior_director" && !isPreSalesDesk) redirect("/dashboard");
  const sb = getSupabase();
  const scope = isPreSalesDesk ? await getDistrictScope(sb, user) : null;

  const { data: formRow } = await sb
    .from("feedback_forms")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  // The table is missing until migration 0027 is applied — say so rather than
  // rendering an empty page that looks like "no feedback yet".
  const { data: rowsRaw, error: rowsError } = await sb
    .from("feedback_requests")
    .select(
      "id, token, customer_name, customer_phone, scheduled_for, sent_at, responded_at, answers, created_at, " +
        "service_requests!request_id(requested_by, project_id, visit_date, visit_time, project:projects!project_id(name), requester:users!requested_by(full_name))",
    )
    .order("created_at", { ascending: false });

  const migrationMissing = !!rowsError || !formRow;

  type Raw = {
    id: string;
    token: string;
    customer_name: string | null;
    customer_phone: string | null;
    scheduled_for: string | null;
    sent_at: string | null;
    responded_at: string | null;
    answers: Record<string, string> | null;
    created_at: string;
    service_requests: {
      requested_by: string | null;
      project_id: string | null;
      visit_date: string | null;
      visit_time: string | null;
      project: { name: string } | null;
      requester: { full_name: string } | null;
    } | null;
  };

  let raw = (rowsRaw ?? []) as unknown as Raw[];

  if (scope) {
    // A branch desk has no downline, so it is scoped by DISTRICT — every site
    // visit to a project it works, whoever raised it. A desk with no district
    // configured gets an empty projectIds and therefore sees nothing, matching
    // how getDistrictScope fails closed everywhere else.
    raw = raw.filter(
      (r) => r.service_requests?.project_id && scope.projectIds.includes(r.service_requests.project_id),
    );
  } else if (!isAdmin) {
    // A Senior Director sees only feedback for visits raised by their own team.
    // getDownlineIds includes themselves — and returns EVERY id for the hidden dev
    // account, so a role-switched dev still sees the whole picture.
    const team = new Set(await getDownlineIds(sb, user.id));
    raw = raw.filter((r) => r.service_requests?.requested_by && team.has(r.service_requests.requested_by));
  }

  const rows: FeedbackRow[] = raw.map((r) => ({
    id: r.id,
    token: r.token,
    customer: r.customer_name,
    phone: r.customer_phone,
    project: r.service_requests?.project?.name ?? null,
    raisedBy: r.service_requests?.requester?.full_name ?? null,
    visitDate: r.service_requests?.visit_date ?? null,
    visitTime: r.service_requests?.visit_time ?? null,
    scheduledFor: r.scheduled_for,
    sentAt: r.sent_at,
    respondedAt: r.responded_at,
    answers: r.answers ?? null,
  }));

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
    <>
      <PageHeader
        title="Site Visit Feedback"
        subtitle={
          isAdmin
            ? "Responses from customers after their site visit — and the form they are asked."
            : "Feedback from site visits raised by your team."
        }
      />
      <FeedbackWorkspace
        rows={rows}
        form={form}
        canEdit={isAdmin}
        migrationMissing={migrationMissing}
      />
    </>
  );
}
