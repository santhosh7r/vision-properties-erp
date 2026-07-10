// Dev / support logins that must never appear in any user-listing panel — the
// Users / View Partner page, the manager dropdown, the sales hierarchy, the
// Activity actor filter, or the dashboard user count. These accounts can still
// SIGN IN (the login lookup is intentionally left unfiltered); only their
// visibility across the admin panels is suppressed. Matched by email (stable).
export const HIDDEN_USER_EMAILS = ["dev@visionproperties.co"];

// PostgREST value list for a `.not("email", "in", HIDDEN_IN_LIST)` filter,
// e.g. "(dev@visionproperties.co)". Emails contain no commas/parens so no
// quoting is needed.
export const HIDDEN_IN_LIST = `(${HIDDEN_USER_EMAILS.join(",")})`;

// The hidden accounts double as the "dev" accounts — dev-only tooling (e.g. the
// Excel import) is gated to these emails so no other admin sees or reaches it.
export function isHiddenUser(email: string | null | undefined): boolean {
  return !!email && HIDDEN_USER_EMAILS.includes(email.trim().toLowerCase());
}
