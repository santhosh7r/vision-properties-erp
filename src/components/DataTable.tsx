"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sort?: (row: T) => string | number; // enables sorting on this column
  align?: "left" | "right" | "center";
  width?: string;
  hideBelow?: "sm" | "md" | "lg"; // responsive hiding
}

export interface FilterDef<T> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  search?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: FilterDef<T>[];
  getRowHref?: (row: T) => string;
  pageSizes?: number[];
  initialPageSize?: number;
  emptyMessage?: string;
  emptyHint?: string;
}

const HIDE_CLASS: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function Chevron({ dir }: { dir: "up" | "down" | "none" }) {
  if (dir === "none")
    return <span className="inline-block w-3 opacity-0">·</span>;
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === "up" ? "rotate(180deg)" : "none" }}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function Page({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm text-[var(--text-2)] transition-colors enabled:hover:border-[var(--border-strong)] enabled:hover:text-[var(--text)] disabled:opacity-40"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      {children}
    </button>
  );
}

export default function DataTable<T>({
  rows,
  columns,
  search,
  searchPlaceholder = "Search…",
  filters = [],
  getRowHref,
  pageSizes = [10, 25, 50],
  initialPageSize = 10,
  emptyMessage = "No records found.",
  emptyHint,
}: Props<T>) {
  const router = useRouter();
  const prefetched = useRef<Set<string>>(new Set());
  const prefetch = (href: string) => {
    if (prefetched.current.has(href)) return;
    prefetched.current.add(href);
    router.prefetch(href);
  };
  const [query, setQuery] = useState("");
  const [filterVals, setFilterVals] = useState<Record<string, string>>({});
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (search && query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => search(r).toLowerCase().includes(q));
    }
    for (const f of filters) {
      const v = filterVals[f.id];
      if (v) out = out.filter((r) => f.match(r, v));
    }
    if (sortId) {
      const col = columns.find((c) => c.id === sortId);
      if (col?.sort) {
        const dir = sortDir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.sort!(a);
          const bv = col.sort!(b);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }
    }
    return out;
  }, [rows, search, query, filters, filterVals, sortId, sortDir, columns]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  function toggleSort(col: Column<T>) {
    if (!col.sort) return;
    if (sortId === col.id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortId(col.id);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        {search && (
          <div className="relative min-w-0 flex-1" style={{ maxWidth: 360 }}>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="input"
              style={{ paddingLeft: 36 }}
            />
          </div>
        )}
        {filters.map((f) => (
          <select
            key={f.id}
            value={filterVals[f.id] ?? ""}
            onChange={(e) => {
              setFilterVals((v) => ({ ...v, [f.id]: e.target.value }));
              setPage(0);
            }}
            className="select"
            style={{ width: "auto", minWidth: 150 }}
          >
            <option value="">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {total} {total === 1 ? "record" : "records"}
        </span>
      </div>

      <div style={{ borderTop: "1px solid var(--border)" }} />

      {/* Table */}
      {total === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-sm font-medium text-[var(--text-2)]">{emptyMessage}</p>
          {emptyHint && <p className="mt-1 text-xs text-[var(--muted)]">{emptyHint}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sortId === c.id;
                  return (
                    <th
                      key={c.id}
                      className={`th ${c.hideBelow ? HIDE_CLASS[c.hideBelow] : ""}`}
                      style={{
                        width: c.width,
                        textAlign: c.align ?? "left",
                        cursor: c.sort ? "pointer" : "default",
                        userSelect: "none",
                      }}
                      onClick={() => toggleSort(c)}
                    >
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ color: active ? "var(--text)" : undefined }}
                      >
                        {c.header}
                        {c.sort && (
                          <Chevron dir={active ? (sortDir === "asc" ? "down" : "up") : "none"} />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const href = getRowHref?.(row);
                return (
                  <tr
                    key={i}
                    onClick={href ? () => router.push(href) : undefined}
                    // Warm the route as soon as the pointer (or a finger) lands
                    // on the row, so the click itself has less to fetch. Each
                    // href is only ever prefetched once.
                    onMouseEnter={href ? () => prefetch(href) : undefined}
                    onTouchStart={href ? () => prefetch(href) : undefined}
                    style={{ cursor: href ? "pointer" : undefined }}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={`td ${c.hideBelow ? HIDE_CLASS[c.hideBelow] : ""}`}
                        style={{ textAlign: c.align ?? "left" }}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer / pagination */}
      {total > 0 && (
        <>
          <div style={{ borderTop: "1px solid var(--border)" }} />
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span>
                Showing {start + 1}–{Math.min(start + pageSize, total)} of {total}
              </span>
              <span className="mx-1">·</span>
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="select"
                style={{ width: "auto", padding: "4px 26px 4px 8px" }}
              >
                {pageSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <Page onClick={() => setPage(0)} disabled={safePage === 0}>
                «
              </Page>
              <Page onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
                ‹
              </Page>
              <span className="px-2 text-sm text-[var(--text-2)]">
                {safePage + 1} / {pageCount}
              </span>
              <Page onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>
                ›
              </Page>
              <Page onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1}>
                »
              </Page>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
