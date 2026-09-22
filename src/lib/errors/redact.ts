// ---------------------------------------------------------------------------
// REDACTION — the gate everything passes through before it can be stored.
//
// The Error Logs table is a developer surface, but it is still a database table
// that will be read, exported and pasted into chat. Nothing that could be
// replayed as a credential may reach it: passwords, tokens, JWTs, API keys, the
// Supabase service-role key, cookies, Authorization headers, connection strings.
//
// Two rules make this hold in practice rather than in theory:
//   1. It is applied to EVERY free-text field (message, stack, hint, details)
//      and recursively to EVERY value of the context bag — not to a hand-picked
//      list of fields somebody has to remember to extend.
//   2. It is pattern-based, not allow-list based, so a secret that arrives in a
//      shape nobody anticipated (inside a stack frame, inside a URL query, in
//      the middle of a sentence) is still caught.
//
// Isomorphic on purpose: the browser reporter redacts before the payload leaves
// the tab, and the server redacts again on the way in. A secret would have to
// slip past the same filter twice.
// ---------------------------------------------------------------------------

export const REDACTED = "[redacted]";

/**
 * Object keys whose VALUE is dropped outright, whatever it looks like. Matched
 * case-insensitively against the key as a substring, so `user_password`,
 * `X-Api-Key` and `refreshToken` are all covered.
 */
const SECRET_KEY_PARTS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "privatekey",
  "private_key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "credential",
  "jwt",
  "bearer",
  "signature",
  "service_role",
  "servicerole",
  "anon_key",
  "salt",
  "hash",
  "otp",
  "pin",
  "cvv",
  "card_number",
];

/**
 * Value-shaped secrets. Order matters a little — the broad key/value sweep runs
 * last so the specific formats get a chance to name themselves first.
 */
const VALUE_PATTERNS: { re: RegExp; to: string }[] = [
  // JSON Web Tokens — Supabase anon/service keys and our own session cookie.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, to: "[redacted:jwt]" },
  // Postgres / generic connection strings, including the password in them.
  {
    re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`]+/gi,
    to: "[redacted:connection-string]",
  },
  // Any URL carrying credentials in its authority — keep the scheme, drop the
  // user:pass that precedes the host.
  { re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@"'`]+:[^\s/@"'`]+@/gi, to: "$1[redacted:credentials]@" },
  // Authorization headers, in prose or in a serialised header bag.
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: "Bearer [redacted]" },
  { re: /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, to: "Basic [redacted]" },
  // Vendor-shaped keys (Stripe, GitHub, Google, Slack, AWS, SendGrid…).
  { re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, to: "[redacted:key]" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, to: "[redacted:key]" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, to: "[redacted:key]" },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{8,}\b/g, to: "[redacted:key]" },
  { re: /\bAKIA[0-9A-Z]{12,}\b/g, to: "[redacted:key]" },
  { re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, to: "[redacted:key]" },
  // `key=value` / `key: value` / `"key":"value"` anywhere in free text.
  {
    re: new RegExp(
      String.raw`(["'\w[\]-]*(?:${SECRET_KEY_PARTS.join("|")})["'\w-]*)\s*(=|:)\s*("[^"]*"|'[^']*'|\S+)`,
      "gi",
    ),
    to: `$1$2 ${REDACTED}`,
  },
];

/**
 * Absolute filesystem paths leak the deploy layout and the developer's home
 * directory. The part of a stack frame that matters is the project-relative
 * path, so keep that and drop the prefix.
 */
function stripAbsolutePaths(text: string): string {
  return text
    // /Users/someone/work/app/src/lib/x.ts  ->  src/lib/x.ts
    .replace(/(?:\/(?:Users|home|root|var|opt|srv|app|workspace|tmp)\/[^\s():'"]*?)\/((?:src|app|pages|components|lib|node_modules|\.next)\/[^\s():'"]*)/g, "$1")
    // C:\Users\someone\app\src\lib\x.ts
    .replace(/[A-Za-z]:\\(?:[^\s\\():'"]+\\)*((?:src|app|lib|node_modules|\.next)\\[^\s():'"]*)/g, "$1")
    // Anything still absolute and deep gets its middle removed.
    .replace(/\/(?:Users|home|root)\/[^\s/():'"]+\//g, "~/");
}

/** Redact a single string. Safe to call on anything, including "". */
export function redactText(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  for (const { re, to } of VALUE_PATTERNS) {
    // Fresh lastIndex each time — these are /g regexes held in module scope.
    re.lastIndex = 0;
    out = out.replace(re, to);
  }
  // Environment variable names are fine to see; their values are not. Any
  // `NEXT_PUBLIC_…=`/`SUPABASE_…=` pair is already caught above when the name
  // contains a secret word; this catches the rest.
  out = out.replace(/\b([A-Z][A-Z0-9_]{3,})\s*=\s*("[^"]*"|'[^']*'|\S+)/g, (m, name: string) =>
    /KEY|SECRET|TOKEN|PASSWORD|DSN|URL|URI|CREDENTIAL/.test(name) ? `${name}=${REDACTED}` : m,
  );
  return stripAbsolutePaths(out);
}

/** Cap a string, marking the cut so a truncated stack is never mistaken for a short one. */
export function clamp(input: string | null | undefined, max: number): string | null {
  if (!input) return null;
  const s = String(input);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_ARRAY = 20;
const MAX_VALUE = 500;

/**
 * Recursively redact an arbitrary value for storage in `context` / `db_details`.
 *
 * Drops secret-named keys entirely, redacts every string, bounds depth, breadth
 * and length, and survives cycles, getters that throw and exotic values (Map,
 * Set, Error, BigInt, functions) — because the call site that hands us a context
 * bag is usually a `catch` that has no idea what it caught.
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return null;

  const t = typeof value;
  if (t === "string") return clamp(redactText(value as string), MAX_VALUE);
  if (t === "number" || t === "boolean") return value;
  if (t === "bigint") return `${(value as bigint).toString()}n`;
  if (t === "function") return "[function]";
  if (t === "symbol") return "[symbol]";

  if (depth >= MAX_DEPTH) return "[depth-limit]";

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: clamp(redactText(value.message), MAX_VALUE),
      stack: clamp(redactText(value.stack), 2000),
    };
  }
  if (value instanceof Map) return redactValue(Object.fromEntries(value), depth, seen);
  if (value instanceof Set) return redactValue([...value], depth, seen);

  const obj = value as object;
  if (seen.has(obj)) return "[circular]";
  seen.add(obj);

  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY).map((v) => redactValue(v, depth + 1, seen));
    if (value.length > MAX_ARRAY) out.push(`…${value.length - MAX_ARRAY} more`);
    return out;
  }

  const out: Record<string, unknown> = {};
  let n = 0;
  for (const key of Object.keys(obj)) {
    if (n >= MAX_KEYS) {
      out["…"] = "key-limit";
      break;
    }
    n += 1;
    if (isSecretKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    let raw: unknown;
    try {
      raw = (obj as Record<string, unknown>)[key];
    } catch {
      // A getter that throws must not take the whole capture down with it.
      out[key] = "[unreadable]";
      continue;
    }
    out[key] = redactValue(raw, depth + 1, seen);
  }
  return out;
}

export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEY_PARTS.some((p) => k.includes(p.replace(/[^a-z0-9]/g, "")));
}

/**
 * Redact a context bag and guarantee it stays small enough to store. Returns
 * null for an empty bag so the column stays NULL rather than `{}`.
 */
export function redactContext(
  ctx: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!ctx) return null;
  const out = redactValue(ctx) as Record<string, unknown> | null;
  if (!out || Object.keys(out).length === 0) return null;
  // Hard ceiling on the serialised size — a runaway context must not be able to
  // bloat a row that is written thousands of times.
  let json: string;
  try {
    json = JSON.stringify(out);
  } catch {
    return null;
  }
  if (json.length > 8000) return { note: "context omitted (too large)", keys: Object.keys(out) };
  return out;
}
