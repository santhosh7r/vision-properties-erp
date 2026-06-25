"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function apply(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.classList.toggle("light", theme === "light");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

// Light / Dark appearance selector (mirrors the header toggle, persisted to
// localStorage on this device).
export default function ThemePref() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-10" />;

  return (
    <div
      className="inline-flex gap-1 rounded-lg border p-1"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      {(["light", "dark"] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setTheme(t);
            apply(t);
          }}
          className="rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors"
          style={
            theme === t
              ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }
              : { color: "var(--muted)" }
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
