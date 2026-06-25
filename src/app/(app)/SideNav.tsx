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
];

export default function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem("nav:collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
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
        {groups.map((group) => (
          <div key={group.name} className="mb-4 last:mb-0">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                {group.name}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = item.href === activeHref && bestScore >= 0;
                const Icon = Icons[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className="group relative flex items-center rounded-xl text-sm font-medium transition-colors"
                    style={{
                      gap: 12,
                      padding: collapsed ? "11px" : "11px 12px",
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
                      size={20}
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
              })}
            </div>
          </div>
        ))}
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
    </aside>
  );
}
