// ============================================================================
// Hierarchy helpers that need the live manager tree from the DB.
// (Pure, DB-free role logic lives in roles.ts.)
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { isHiddenUser } from "./hidden-users";

// Every user id in `userId`'s downline — INCLUDING `userId` itself. Walks DOWN
// the manager_id tree from a single cheap fetch. Used to roll a member's
// bookings/blockings up to everyone above them: a manager sees a record when its
// salesperson (or whoever created it) sits anywhere in their subtree.
//
// DEV EXCEPTION: the hidden dev account has no team of its own, so scoping it to
// a downline would leave every sales screen empty and untestable. It gets EVERY
// user id instead, which makes the role-switched views show real data. This is
// the single chokepoint for downline scoping across customers, bookings,
// requests, profile and the dashboard/report queries, so the exception lives
// here rather than being repeated at a dozen call sites.
export async function getDownlineIds(
  sb: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await sb.from("users").select("id, manager_id, email");
  const rows = (data ?? []) as { id: string; manager_id: string | null; email: string }[];

  const self = rows.find((u) => u.id === userId);
  if (self && isHiddenUser(self.email)) return rows.map((u) => u.id);

  const childrenOf = new Map<string, string[]>();
  for (const u of rows) {
    if (!u.manager_id) continue;
    const arr = childrenOf.get(u.manager_id) ?? [];
    arr.push(u.id);
    childrenOf.set(u.manager_id, arr);
  }

  const out = new Set<string>();
  const stack = [userId];
  let guard = 0;
  while (stack.length && guard++ < 1_000_000) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return [...out];
}
