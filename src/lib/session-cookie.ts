// The session cookie's NAME, on its own, with no imports.
//
// Middleware runs on the Edge runtime and needs only this one string. Taking it
// from lib/session.ts dragged that module's whole dependency chain — the
// Supabase client, and through it the error capture layer — into the edge
// bundle, which is both large and full of Node APIs the Edge runtime does not
// have. One constant in one file keeps middleware tiny.
export const SESSION_COOKIE = "vp_session";
