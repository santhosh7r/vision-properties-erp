import type { ErrorSource } from "./types";

// ---------------------------------------------------------------------------
// RUNTIME / DEVICE CONTEXT — the "where was this running" half of a log row.
//
// Everything here is best-effort and must degrade to null rather than throw:
// `process` does not exist in the browser, `navigator` does not exist on the
// server, and a User-Agent string is attacker-controlled input that may be
// absent, enormous or nonsense.
// ---------------------------------------------------------------------------

/** "development" | "production" | "test" — what the row is tagged with. */
export function environmentName(): string {
  if (typeof process !== "undefined" && process.env?.NODE_ENV) return process.env.NODE_ENV;
  return "production";
}

/**
 * The build this error came from. Without it, "is this still happening after
 * the fix?" is unanswerable. Reads whatever the host provides, in order of
 * specificity, and falls back to the package version.
 */
export function releaseName(): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  const e = process.env;
  return (
    e.NEXT_PUBLIC_APP_VERSION ||
    e.NEXT_PUBLIC_RELEASE ||
    e.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    e.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ||
    e.SOURCE_VERSION?.slice(0, 12) ||
    null
  );
}

/**
 * Which JS runtime is executing: browser, edge or nodejs.
 *
 * Deliberately avoids `process.versions`. This module is reachable from the
 * middleware bundle, and touching a Node-only API there is a build warning today
 * and a hard error on a stricter host — for a value we can get from
 * NEXT_RUNTIME and the EdgeRuntime global instead.
 */
export function runtimeName(): string {
  if (typeof window !== "undefined" && typeof document !== "undefined") return "browser";
  if (typeof (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime === "string") return "edge";
  const declared = typeof process !== "undefined" ? process.env?.NEXT_RUNTIME : undefined;
  if (declared) return declared;
  return typeof process !== "undefined" ? "nodejs" : "unknown";
}

/** Default source for wherever this is running, when the call site did not say. */
export function defaultSource(): ErrorSource {
  const r = runtimeName();
  if (r === "browser") return "browser";
  if (r === "edge") return "edge";
  return "server";
}

export interface DeviceInfo {
  browser: string | null;
  os: string | null;
  device: string | null;
}

// Ordered: the first match wins, so Edge is tested before Chrome (its UA claims
// both) and Chrome before Safari (ditto).
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/([\d.]+)/, "Edge"],
  [/\bOPR\/([\d.]+)/, "Opera"],
  [/\bSamsungBrowser\/([\d.]+)/, "Samsung Internet"],
  [/\bFirefox\/([\d.]+)/, "Firefox"],
  [/\bFxiOS\/([\d.]+)/, "Firefox"],
  [/\bCriOS\/([\d.]+)/, "Chrome"],
  [/\bChrome\/([\d.]+)/, "Chrome"],
  [/\bVersion\/([\d.]+).*\bSafari\//, "Safari"],
  [/\bSafari\/([\d.]+)/, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/\bWindows NT ([\d.]+)/, "Windows"],
  [/\bMac OS X ([\d_.]+)/, "macOS"],
  [/\b(?:iPhone|iPad|iPod).*?OS ([\d_]+)/, "iOS"],
  [/\bAndroid ([\d.]+)/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * Coarse browser / OS / form-factor from a User-Agent. Coarse on purpose —
 * a major version and a family is enough to spot "only on Safari 15", and
 * anything finer is fingerprinting the user rather than the bug.
 */
export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua || typeof ua !== "string") return { browser: null, os: null, device: null };
  const s = ua.slice(0, 500);

  let browser: string | null = null;
  for (const [re, label] of BROWSERS) {
    const m = re.exec(s);
    if (m) {
      const major = m[1]?.split(".")[0];
      browser = major ? `${label} ${major}` : label;
      break;
    }
  }
  if (!browser && /\b(bot|crawler|spider|curl|wget|postman|node-fetch|axios)\b/i.test(s)) {
    browser = "Automated client";
  }

  let os: string | null = null;
  for (const [re, label] of OSES) {
    const m = re.exec(s);
    if (m) {
      const ver = m[1]?.replace(/_/g, ".").split(".").slice(0, 2).join(".");
      os = ver ? `${label} ${ver}` : label;
      break;
    }
  }

  const device = /\b(iPad|Tablet)\b/i.test(s)
    ? "Tablet"
    : /\b(Mobi|iPhone|Android.*Mobile|Windows Phone)\b/i.test(s)
      ? "Mobile"
      : "Desktop";

  return { browser, os, device };
}

/**
 * A correlation id for one request. Reuses whatever the platform already put on
 * the request (Vercel, Cloudflare, a load balancer) so a log row can be lined up
 * with an infrastructure trace; invents one only as a last resort.
 */
export function requestIdFrom(headers: Headers | null | undefined): string {
  const h = headers;
  const existing =
    h?.get("x-request-id") ||
    h?.get("x-vercel-id") ||
    h?.get("cf-ray") ||
    h?.get("x-amzn-trace-id") ||
    h?.get("x-correlation-id");
  if (existing) return existing.slice(0, 120);
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
