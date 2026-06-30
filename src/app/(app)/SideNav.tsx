"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { Icons } from "@/components/icons";

const GROUP_ORDER: NavItem["group"][] = [
  "Overview",
  "Inventory",
  "Pre-Sales",
  "Post-Sales",
  "Clients",
  "Sales",
  "Business Partners",
  "Tokens",
  "Operations",
  "Reports",
  "Administration",
  "Account",
];

export default function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Which accordion sections are expanded. The section holding the current page
  // is opened automatically (see effect below); the user can toggle any other.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Hover tooltip for the collapsed rail. Rendered as a fixed element so it is
  // not clipped by the scrolling nav's overflow.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  // Highlight the SINGLE best-matching item for the current URL, so query-param
  // entry points (e.g. /bookings?new=blocking vs /bookings) light up the right
  // item instead of every sibling that shares the path. Score: path-only match
  // = 0; a match where ALL of the item's query params are present = 1 + count
  // (more specific wins); a path or query miss = -1 (not active).
  const scoreHref = (href: string): number => {
    const [path, query] = href.split("?");
    if (pathname !== path && !pathname.startsWith(path + "/")) return -1;
    if (!query) return 0;
    const want = new URLSearchParams(query);
    for (const [k, v] of want) {
      if (searchParams.get(k) !== v) return -1;
    }
    return 1 + [...want].length;
  };
  let activeHref = "";
  let bestScore = -1;
  for (const item of items) {
    const sc = scoreHref(item.href);
    if (sc > bestScore) {
      bestScore = sc;
      activeHref = item.href;
    }
  }
  const activeGroup =
    bestScore >= 0 ? items.find((i) => i.href === activeHref)?.group ?? null : null;

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem("nav:collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Keep the section of the current page expanded (without collapsing any the
  // user has opened manually).
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggle() {
    setTip(null);
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("nav:collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const groups = GROUP_ORDER.map((g) => ({
    name: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  // Dashboard (and anything else under "Overview") sits at the top with no
  // section header; every other section is a collapsible accordion.
  const topItems = groups.filter((g) => g.name === "Overview").flatMap((g) => g.items);
  const sections = groups.filter((g) => g.name !== "Overview");

  function renderItem(item: NavItem) {
    const active = item.href === activeHref && bestScore >= 0;
    const Icon = Icons[item.icon];
    return (
      <Link
        key={item.href}
        href={item.href}
        onMouseEnter={
          collapsed
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setTip({ label: item.label, top: r.top + r.height / 2 });
              }
            : undefined
        }
        onMouseLeave={collapsed ? () => setTip(null) : undefined}
        className="group relative flex items-center rounded-xl text-[15px] font-medium transition-colors"
        style={{
          gap: 12,
          padding: collapsed ? "12px" : "12px 14px",
          justifyContent: collapsed ? "center" : "flex-start",
          color: active ? "var(--accent)" : "var(--muted)",
          background: active ? "var(--accent-soft)" : "transparent",
        }}
      >
        <span
          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity"
          style={{ background: "var(--accent)", opacity: active ? 1 : 0 }}
        />
        <Icon
          size={22}
          className="shrink-0 transition-colors group-hover:text-[var(--text)]"
          style={active ? { color: "var(--accent)" } : undefined}
        />
        {!collapsed && (
          <span className="whitespace-nowrap transition-colors group-hover:text-[var(--text)]">
            {item.label}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 flex-col md:flex"
      style={{
        width: collapsed ? 76 : 264,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <img
          src="/logo-mark.png"
          alt="Vision Properties"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="whitespace-nowrap text-[15px] font-semibold leading-tight tracking-tight">
              <span style={{ color: "var(--brand-red)" }}>Vision</span>{" "}
              <span style={{ color: "var(--accent)" }}>Properties</span>
            </p>
            <p className="whitespace-nowrap text-[11px] text-[var(--muted)]">
              Plot Management
            </p>
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }} />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {/* Collapsed rail: show every item as an icon, no accordion. */}
        {collapsed ? (
          <div className="flex flex-col gap-1">
            {topItems.map(renderItem)}
            {sections.flatMap((s) => s.items).map(renderItem)}
          </div>
        ) : (
          <>
            {/* Dashboard / Overview — no header, always visible */}
            {topItems.length > 0 && (
              <div className="mb-2 flex flex-col gap-1">{topItems.map(renderItem)}</div>
            )}

            {/* Collapsible sections */}
            {sections.map((group) => {
              const open = openGroups.has(group.name);
              const hasActive = group.name === activeGroup;
              return (
                <div key={group.name} className="mb-1.5 last:mb-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    aria-expanded={open}
                    className="group flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-[15px] font-semibold tracking-tight transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: hasActive ? "var(--accent)" : "var(--text)" }}
                  >
                    <span className="whitespace-nowrap">{group.name}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 transition-transform"
                      style={{ transform: open ? "rotate(90deg)" : "none" }}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                  {open && (
                    <div className="mt-1 flex flex-col gap-1">{group.items.map(renderItem)}</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div style={{ borderTop: "1px solid var(--border)" }} className="p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center rounded-xl text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          style={{
            gap: 12,
            padding: collapsed ? "11px" : "11px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            style={{
              transform: collapsed ? "rotate(180deg)" : "none",
              transition: "transform 0.22s ease",
              opacity: mounted ? 1 : 0,
            }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!collapsed && <span className="whitespace-nowrap">Collapse</span>}
        </button>
      </div>

      {/* Hover tooltip for the collapsed rail (fixed → escapes nav overflow). */}
      {collapsed && tip && (
        <div
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-medium shadow-lg"
          style={{
            left: 84,
            top: tip.top,
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        >
          {tip.label}
        </div>
      )}
    </aside>
  );
}
