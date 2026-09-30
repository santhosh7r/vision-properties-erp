"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { TableState } from "./DataTable";

// Keeps a DataTable's search / filters / sort / page in the URL, so leaving the
// list (open a record, go Back — the browser's or the page's) brings the viewer
// back to exactly the view they had, not a reset table.
//
//   /bookings?project=<id>&status=confirmed&q=ravi&page=2
//
// The URL is rewritten in place (history.replaceState — no navigation, no server
// round-trip, no extra Back step). The last list URL is also remembered for the
// session under `listStorageKey(pathname)`, for a detail page's own Back link
// (RememberedBackLink) — which may be reached by a route that skipped the list.
//
// `params` maps each filter id to its URL name. Only these, plus q / sort / dir
// / page / size, are touched; any other query param the page uses (e.g.
// ?mode=blocking) is left alone.

export function listStorageKey(pathname: string): string {
  return `vp:list:${pathname}`;
}

export function useUrlTableState(params: Record<string, string>): {
  initialState: Partial<TableState>;
  onStateChange: (s: TableState) => void;
} {
  const sp = useSearchParams();
  const pathname = usePathname();

  // Read once, on mount: afterwards the table owns the state and the URL follows it.
  const initialState = useMemo<Partial<TableState>>(() => {
    const filters: Record<string, string> = {};
    for (const [id, name] of Object.entries(params)) {
      const v = sp.get(name);
      if (v) filters[id] = v;
    }
    const page = Number(sp.get("page"));
    const size = Number(sp.get("size"));
    return {
      q: sp.get("q") ?? "",
      filters,
      sortId: sp.get("sort"),
      sortDir: sp.get("dir") === "desc" ? "desc" : "asc",
      page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
      pageSize: Number.isInteger(size) && size > 0 ? size : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStateChange = useCallback(
    (s: TableState) => {
      const url = new URL(window.location.href);
      const set = (name: string, value: string | null) => {
        if (value) url.searchParams.set(name, value);
        else url.searchParams.delete(name);
      };
      for (const [id, name] of Object.entries(params)) set(name, s.filters[id] || null);
      set("q", s.q.trim() || null);
      set("sort", s.sortId);
      set("dir", s.sortId && s.sortDir === "desc" ? "desc" : null);
      set("page", s.page > 0 ? String(s.page + 1) : null);
      set("size", s.pageSize !== 10 ? String(s.pageSize) : null);

      const next = url.pathname + url.search;
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, "", next);
      }
      try {
        sessionStorage.setItem(listStorageKey(pathname), next);
      } catch {
        /* storage blocked — the browser's own Back still restores the view */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname],
  );

  return { initialState, onStateChange };
}
