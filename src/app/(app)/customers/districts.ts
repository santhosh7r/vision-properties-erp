import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Distinct district names already used across projects — feeds the District
// dropdown on customer forms so it's a pick-list (with free typing) not a blank
// text box.
export async function distinctProjectDistricts(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("projects").select("district");
  return [
    ...new Set(((data ?? []) as { district: string | null }[]).map((r) => (r.district ?? "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
}
