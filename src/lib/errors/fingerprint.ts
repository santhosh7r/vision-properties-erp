// ---------------------------------------------------------------------------
// FINGERPRINTING — what decides that two occurrences are the same bug.
//
// This is the load-bearing piece of the deduplication requirement. Get it too
// SPECIFIC and one broken query writes a row per request; get it too BROAD and
// unrelated failures collapse into one unreadable group.
//
// The rule: fingerprint on the SHAPE of the failure, never on its particulars.
// A message is normalised until only its skeleton is left — ids, numbers,
// dates, quoted values, addresses and paths are replaced by placeholders — and
// combined with the error type, the classified kind, the module and the top few
// stack frames. So:
//
//   "duplicate key value violates unique constraint \"users_email_key\""      ┐
//   "duplicate key value violates unique constraint \"users_email_key\""      ┴ one row
//
//   "Cannot read properties of undefined (reading 'plot_no')" at bookings:42  ┐
//   "Cannot read properties of undefined (reading 'amount')"  at payments:88  ┴ two rows
//
// Pure and synchronous so it runs identically in Node, on the Edge runtime and
// in the browser — no Web Crypto, no node:crypto, no async.
// ---------------------------------------------------------------------------

/**
 * Reduce a message to its skeleton. Every replacement here exists because the
 * thing it removes varies between two occurrences of the SAME problem.
 */
export function normalizeMessage(message: string): string {
  return (
    message
      .toLowerCase()
      // UUIDs, the single biggest source of per-request variation.
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "<uuid>")
      // ISO timestamps and plain dates.
      .replace(/\b\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?z?)?\b/g, "<date>")
      // Long hex runs (hashes, ids, digests).
      .replace(/\b[0-9a-f]{12,}\b/g, "<hex>")
      // Email addresses and phone numbers that end up inside DB messages.
      .replace(/\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/g, "<email>")
      .replace(/\b(?:\+?\d[\d\s-]{7,}\d)\b/g, "<phone>")
      // URLs — the host and path belong on the row, not in the key.
      .replace(/\bhttps?:\/\/\S+/g, "<url>")
      // Remaining bare numbers (row counts, amounts, line numbers in prose).
      .replace(/\b\d+(?:\.\d+)?\b/g, "<n>")
      // Quoted values: keep the fact that something was quoted, drop what it was
      // — EXCEPT short identifiers, which are usually the constraint or column
      // name and are exactly what distinguishes two different bugs.
      .replace(/"([^"]{0,40})"/g, (_m, inner: string) =>
        /^[a-z0-9_.]+$/.test(inner) ? `"${inner}"` : '"<v>"',
      )
      .replace(/'([^']{0,40})'/g, (_m, inner: string) =>
        /^[a-z0-9_.]+$/.test(inner) ? `'${inner}'` : "'<v>'",
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300)
  );
}

/**
 * The first few meaningful stack frames, as `file:line`. Framework and
 * node_modules frames are dropped: they are identical across unrelated bugs and
 * would merge them. Absolute paths are already stripped by redaction, but the
 * frame is reduced again here so a dev build and a production build of the same
 * code produce the same key.
 */
export function stackSignature(stack: string | null | undefined, take = 3): string {
  if (!stack) return "";
  const frames: string[] = [];
  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;
    if (/node_modules|node:internal|webpack-internal|next[/\\]dist|\[native code\]/.test(trimmed)) continue;
    const m = /([\w./\\-]+\.(?:tsx?|jsx?|mjs|cjs)):(\d+)(?::\d+)?/.exec(trimmed);
    if (!m) continue;
    // Keep the last two path segments — enough to tell files apart, stable
    // across build layouts.
    const file = m[1].split(/[/\\]/).slice(-2).join("/");
    frames.push(`${file}:${m[2]}`);
    if (frames.length >= take) break;
  }
  return frames.join("|");
}

/**
 * cyrb128 — a small, fast, well-distributed 128-bit string hash. Chosen over
 * SHA-256 because it is synchronous and dependency-free in all three runtimes;
 * the fingerprint is a grouping key, not a security boundary, so cryptographic
 * strength buys nothing here.
 */
function cyrb128(str: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i += 1) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const out = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  return out.map((n) => n.toString(16).padStart(8, "0")).join("");
}

export interface FingerprintInput {
  name: string;
  message: string;
  kind: string;
  code?: string | null;
  module?: string | null;
  source?: string | null;
  stack?: string | null;
  /** Set by a call site that knows better than the heuristics. */
  override?: string | null;
}

/**
 * The group key. `override` lets a call site collapse a family of errors it
 * understands (say, every failure of one integration) into one row deliberately.
 */
export function fingerprintOf(input: FingerprintInput): string {
  if (input.override) return cyrb128(`custom:${input.override}`);
  const parts = [
    input.name || "Error",
    input.kind || "unknown",
    input.code ?? "",
    input.module ?? "",
    input.source ?? "",
    normalizeMessage(input.message || ""),
    stackSignature(input.stack),
  ];
  return cyrb128(parts.join("\u0000"));
}

/** The short code a developer sees. Mirrors `short_id` in the SQL exactly. */
export function shortIdFor(fingerprint: string): string {
  return `ERR-${fingerprint.slice(0, 7).toUpperCase()}`;
}

/**
 * The per-occurrence reference the USER is shown. Deliberately different from
 * the group code: it identifies the one moment they hit the problem, which is
 * what a support conversation needs ("it happened at 14:12, reference …").
 */
export function newEventId(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const time = Date.now().toString(36).slice(-5).toUpperCase();
  return `VP-${time}${rand}`;
}
