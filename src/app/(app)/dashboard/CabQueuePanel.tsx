import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { getCabQueue, type CabQueue, type CabQueueItem } from "@/lib/cab-queue";
import { fmtDate, timeAgo } from "@/lib/format";
import { Panel } from "@/components/dashboard";

const SHOW = 6;

// Pre-Sales desk dashboard: the cab requests on its branch — the ones waiting
// for its approval first, soonest visit on top, and a count of the ones still
// with a Senior Director. Same data as the Approvals page and the sidebar count.
export default async function CabQueuePanel({ user }: { user: SessionUser }) {
  let q: CabQueue | null = null;
  try {
    q = await getCabQueue(getSupabase(), user);
  } catch {
    q = null;
  }

  if (!q) {
    return (
      <Panel title="Cab Requests" accent="#e4433a">
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load cab requests — refresh to try again.</p>
      </Panel>
    );
  }

  const waiting = q.awaitingYou.length;
  return (
    <Panel
      title={waiting ? `Cab Requests · ${waiting} waiting for your approval` : "Cab Requests"}
      accent={waiting ? "#e4433a" : "#428fdf"}
      action={
        <Link href={waiting ? "/requests?view=action" : "/requests?type=cab"} className="text-xs font-medium text-[var(--accent)] hover:underline">
          {waiting ? "Review all →" : "All cab requests →"}
        </Link>
      }
    >
      {waiting === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nothing waiting for your approval.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {q.awaitingYou.slice(0, SHOW).map((i) => (
            <Row key={i.id} item={i} />
          ))}
        </ul>
      )}
      {waiting > SHOW && (
        <p className="mt-3 text-xs text-[var(--muted)]">+ {waiting - SHOW} more on the Approvals page.</p>
      )}
      {q.awaitingSenior.length > 0 && (
        <p className="mt-3 border-t pt-3 text-xs text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>
          {q.awaitingSenior.length} more raised by Directors {q.awaitingSenior.length === 1 ? "is" : "are"} with their Senior
          Director — {q.awaitingSenior.length === 1 ? "it comes" : "they come"} to you once approved.{" "}
          <Link href="/requests?type=cab" className="text-[var(--accent)] hover:underline">
            View
          </Link>
        </p>
      )}
    </Panel>
  );
}

function Row({ item: i }: { item: CabQueueItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text)]">
          {i.customer}
          {i.phone && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{i.phone}</span>}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Visit {i.visitDate ? fmtDate(i.visitDate) : "date not set"}
          {i.visitTime ? ` · ${i.visitTime}` : ""}
          {i.project ? ` · ${i.project}` : ""} · raised by {i.requestedBy} {timeAgo(i.createdAt)}
        </p>
      </div>
      <Link href="/requests?view=action" className="btn-ghost shrink-0" style={{ padding: "5px 12px", fontSize: 12 }}>
        Review
      </Link>
    </li>
  );
}
