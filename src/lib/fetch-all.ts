// Supabase caps one response at 1000 rows. Anything that is SUMMED (a token
// balance) or EXPORTED (a monthly report) must read every row, or it is quietly
// wrong rather than visibly short. Pages through until a short page; the query
// must have a stable order (end it with .order("id")) or rows can repeat or be
// skipped across page boundaries.
const PAGE = 1000;

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Every row of a query. On a query error it stops and returns what it has —
 * right for a page that must render something. Pass `{ strict: true }` where a
 * partial result would be a wrong answer (exports): it throws instead.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult,
  opts: { strict?: boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) {
      if (opts.strict) throw new Error(error?.message ?? "Query returned no data");
      break;
    }
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}
