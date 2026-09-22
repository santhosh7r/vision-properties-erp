// ---------------------------------------------------------------------------
// A small fixed-window rate limiter for the error ingestion endpoint.
//
// The endpoint has to be reachable without a session (a crash on the login page
// is exactly the kind we most want to see), which makes it the one unauthenticated
// write path in the application. Without a limit, anyone who found it could fill
// the table — so this is a security control, not a tidiness one.
//
// In-memory and per-instance on purpose: no Redis, no extra infrastructure, and
// no dependency that could itself fail and take the endpoint down. Behind
// several instances the effective limit multiplies by the instance count, which
// is fine — the numbers below are set to stop abuse, not to be exact.
// ---------------------------------------------------------------------------

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets — sent as Retry-After on a 429. */
  retryAfter: number;
}

/**
 * @param key    what to count against (an IP, a user id, a fingerprint)
 * @param limit  how many are allowed per window
 * @param windowMs length of the window
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) evict(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfter };
}

/** Drop expired windows; if that is not enough, clear the lot. */
function evict(now: number): void {
  for (const [k, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size >= MAX_KEYS) buckets.clear();
}

/**
 * The caller's address, as best the platform reports it. Only ever used as a
 * rate-limit key and never stored on a log row — an IP is personal data that the
 * error table has no need for.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown";
  return ip.slice(0, 64);
}
