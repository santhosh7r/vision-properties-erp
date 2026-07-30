-- 0027 · Site Visit Feedback — an admin-customisable form and its responses.
--
-- WHY: after a site visit the customer is asked how it went. The questions are
-- NOT hardcoded — Admin edits them in the panel — so the definition lives in a
-- row (`feedback_forms.questions`, jsonb) rather than in the app, and each
-- response stores the answers keyed by question id.
--
-- Delivery is by a one-time link: WhatsApp only permits business-initiated
-- messages via pre-approved templates, so collecting answers IN the chat would
-- mean a fresh Meta approval every time Admin edits a question. A short template
-- carrying a link to /f/<token> keeps the form freely editable.
--
-- SAFE TO RE-RUN.

-- ---------------------------------------------------------------------------
-- FORM DEFINITION — normally exactly one active row; older rows are kept so a
-- response can always be read back against the wording the customer actually
-- saw.
-- ---------------------------------------------------------------------------
create table if not exists feedback_forms (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Site Visit Feedback',
  intro      text,                                   -- shown above the questions
  thank_you  text,                                   -- shown after submitting
  -- Ordered array of questions. Each item:
  --   { id, label, type: 'choice'|'text', required,
  --     options: [{ value, label, emoji }],          -- choice only
  --     showIf:  { questionId, equals }  }           -- optional branch
  questions  jsonb       not null default '[]'::jsonb,
  is_active  boolean     not null default true,
  updated_by uuid        references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- At most one active form at a time.
create unique index if not exists uniq_feedback_forms_active
  on feedback_forms (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- ONE FEEDBACK LINK PER SITE VISIT
-- Created when Admin gives a cab / site-visit request its final approval.
-- `scheduled_for` is the visit date+time plus six hours — the moment the
-- WhatsApp message becomes due. Sending itself is not wired up yet; `sent_at`
-- stays NULL until it is.
-- ---------------------------------------------------------------------------
create table if not exists feedback_requests (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid references service_requests(id) on delete cascade,
  form_id        uuid references feedback_forms(id)   on delete set null,
  token          text not null unique,                -- the /f/<token> secret
  customer_name  text,
  customer_phone text,
  scheduled_for  timestamptz,                          -- visit time + 6h
  sent_at        timestamptz,                          -- set once WhatsApp goes out
  responded_at   timestamptz,
  answers        jsonb,                                -- { [questionId]: value }
  created_at     timestamptz not null default now()
);
create index if not exists idx_feedback_requests_request   on feedback_requests(request_id);
create index if not exists idx_feedback_requests_scheduled on feedback_requests(scheduled_for) where sent_at is null;
create index if not exists idx_feedback_requests_responded on feedback_requests(responded_at);

-- One feedback link per site visit — re-approving must not mint a second token.
create unique index if not exists uniq_feedback_requests_request
  on feedback_requests(request_id) where request_id is not null;

-- ---------------------------------------------------------------------------
-- SEED the default form (the six questions on the printed feedback sheet).
-- Only when no form exists, so re-running never overwrites Admin's edits.
-- ---------------------------------------------------------------------------
insert into feedback_forms (title, intro, thank_you, questions)
select
  'Site Visit Feedback',
  'Thank you for visiting Vision Properties. Your feedback helps us serve you better.',
  'Thank you for visiting Vision Properties. Your feedback helps us serve you better.',
  '[
    {"id":"q1","label":"How would you rate your site visit experience?","type":"choice","required":true,
     "options":[{"value":"excellent","label":"Excellent","emoji":"⭐"},{"value":"good","label":"Good","emoji":"👍"},
                {"value":"average","label":"Average","emoji":"😐"},{"value":"poor","label":"Poor","emoji":"👎"}]},
    {"id":"q2","label":"How satisfied are you with the project''s location and amenities?","type":"choice","required":true,
     "options":[{"value":"excellent","label":"Excellent","emoji":"⭐"},{"value":"good","label":"Good","emoji":"👍"},
                {"value":"average","label":"Average","emoji":"😐"},{"value":"poor","label":"Poor","emoji":"👎"}]},
    {"id":"q3","label":"How was your experience with our team during the site visit?","type":"choice","required":true,
     "options":[{"value":"excellent","label":"Excellent","emoji":"⭐"},{"value":"good","label":"Good","emoji":"👍"},
                {"value":"average","label":"Average","emoji":"😐"},{"value":"poor","label":"Poor","emoji":"👎"}]},
    {"id":"q4","label":"Did you purchase your plot?","type":"choice","required":true,
     "options":[{"value":"yes","label":"Yes","emoji":"✅"},{"value":"no","label":"No","emoji":"❌"}]},
    {"id":"q5","label":"We are sorry to hear that. Could you please let us know what we missed?","type":"text","required":false,
     "showIf":{"questionId":"q4","equals":"no"}},
    {"id":"q6","label":"Congratulations! 🎉 May we know why you chose Vision Properties?","type":"text","required":false,
     "showIf":{"questionId":"q4","equals":"yes"}}
  ]'::jsonb
where not exists (select 1 from feedback_forms);
