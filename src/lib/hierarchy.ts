// ============================================================================
// Hierarchy helpers that need the live manager tree from the DB.
// (Pure, DB-free role logic lives in roles.ts.)
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

// Every user id in `userId`'s downline — INCLUDING `userId` itself. Walks DOWN
// the manager_id tree from a single cheap fetch. Used to roll a member's
// bookings/blockings up to everyone above them: a manager sees a record when its
// salesperson (or whoever created it) sits anywhere in their subtree.
export async function getDownlineIds(
  sb: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await sb.from("users").select("id, manager_id");
  const childrenOf = new Map<string, string[]>();
  for (const u of (data ?? []) as { id: string; manager_id: string | null }[]) {
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
