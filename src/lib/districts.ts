import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The admin-managed global district master list (migration 0014). Used as the
// District dropdown across the app. Fails open ([]) if the table isn't migrated.
export async function getDistrictNames(sb: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await sb.from("districts").select("name").order("name");
    return ((data ?? []) as { name: string }[]).map((d) => d.name);
  } catch {
    return [];
  }
}
