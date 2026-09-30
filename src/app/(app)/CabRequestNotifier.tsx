"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtDate } from "@/lib/format";

// Pre-Sales desk only (rendered by the app layout for watchesCabQueue roles).
//
// Polls the desk's cab queue and:
//   • keeps the "Approvals" sidebar count current (via the vp:nav-badge event
//     SideNav listens for), and
//   • pops up a notice when a cab request NEWLY reaches the desk for approval —
//     once per request per browser session, so the same one never nags twice,
//     and a summary on first sign-in if some are already waiting.
// Polls every 30s while the tab is visible, and again on focus and on every
// navigation, so an approval just given drops out of the count promptly.

interface Item {
  id: string;
  customer: string;
  project: string | null;
  visitDate: string | null;
  visitTime: string | null;
  requestedBy: string;
}

export const NAV_BADGE_EVENT = "vp:nav-badge";
const POLL_MS = 30_000;

export default function CabRequestNotifier({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const inFlight = useRef(false);
  const seenKey = `vp:cab-seen:${userId}`;

  const poll = useCallback(async () => {
    if (inFlight.current || document.visibilityState !== "visible") return;
    inFlight.current = true;
    try {
      const res = await fetch("/requests/cab-queue", { cache: "no-store" });
      // A redirect (signed out, access removed) lands on an HTML page — ignore.
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return;
      const data = (await res.json()) as { awaitingYou?: Item[] };
      const items = data.awaitingYou ?? [];
      window.dispatchEvent(new CustomEvent(NAV_BADGE_EVENT, { detail: { href: "/requests", count: items.length } }));

      let seen: string[] | null = null;
      try {
        const raw = sessionStorage.getItem(seenKey);
        seen = raw ? (JSON.parse(raw) as string[]) : null;
      } catch {
        /* storage blocked — every poll then behaves like a first sign-in */
      }
      const fresh = seen ? items.filter((i) => !seen!.includes(i.id)) : items;
      if (fresh.length > 0) {
        if (seen === null) {
          setNotice({
            title: `${items.length} cab request${items.length === 1 ? "" : "s"} waiting for your approval`,
            body: "Approved by the Senior Director and ready for Pre-Sales.",
          });
        } else if (fresh.length === 1) {
          const i = fresh[0];
          const when = i.visitDate ? `${fmtDate(i.visitDate)}${i.visitTime ? ` · ${i.visitTime}` : ""}` : "date not set";
          setNotice({
            title: "New cab request for your approval",
            body: `${i.customer} · visit ${when}${i.project ? ` · ${i.project}` : ""} — raised by ${i.requestedBy}`,
          });
        } else {
          setNotice({
            title: `${fresh.length} new cab requests for your approval`,
            body: "Approved by their Senior Directors and ready for Pre-Sales.",
          });
        }
      }
      try {
        sessionStorage.setItem(seenKey, JSON.stringify(items.map((i) => i.id)));
      } catch {
        /* ignore */
      }
    } catch {
      /* offline or server hiccup — keep the last state, try again next poll */
    } finally {
      inFlight.current = false;
    }
  }, [seenKey]);

  // Every navigation (including the redirect back after approving a request).
  useEffect(() => {
    void poll();
  }, [poll, pathname]);

  useEffect(() => {
    const t = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [poll]);

  if (!notice) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="card fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] shadow-lg"
      style={{ borderLeft: "4px solid #428fdf" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{notice.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{notice.body}</p>
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="shrink-0 text-lg leading-none text-[var(--muted)] hover:text-[var(--text)]"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <Link href="/requests?view=action" onClick={() => setNotice(null)} className="btn-primary" style={{ padding: "6px 14px", fontSize: 13 }}>
          Review
        </Link>
      </div>
    </div>
  );
}
