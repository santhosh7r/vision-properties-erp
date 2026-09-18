"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy one short string — a temporary password, a partner code — to the
 * clipboard.
 *
 * The async Clipboard API needs a SECURE CONTEXT, and this app is also served
 * over the LAN on plain http (192.168.x.x), where `navigator.clipboard` is
 * undefined. Hence the execCommand fallback: a copy button that silently does
 * nothing is worse than no button, because the Admin walks away believing they
 * have the password. Same approach as the import table's CopyButton.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function CopyText({
  value,
  label = "Copy",
  className = "btn-ghost shrink-0",
  style = { padding: "4px 10px", fontSize: 12 },
}: {
  value: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [done, setDone] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onCopy() {
    const ok = await copyToClipboard(value);
    setDone(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 2000);
  }

  return (
    <button type="button" onClick={onCopy} className={className} style={style}>
      {done === "copied" ? "Copied ✓" : done === "failed" ? "Copy failed" : label}
    </button>
  );
}
