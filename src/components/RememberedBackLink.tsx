"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listStorageKey } from "./useUrlTableState";

// A detail page's "← Back" that returns to the list AS THE VIEWER LEFT IT —
// the filters / search / page useUrlTableState remembered for `listPath` this
// session. Falls back to the bare list when there is nothing remembered. The
// saved URL is only honoured if it is that list, so storage can't redirect
// the link anywhere else.
export default function RememberedBackLink({ listPath, label }: { listPath: string; label: string }) {
  const [href, setHref] = useState(listPath);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(listStorageKey(listPath));
      if (saved && (saved === listPath || saved.startsWith(`${listPath}?`))) setHref(saved);
    } catch {
      /* storage blocked — the bare list it is */
    }
  }, [listPath]);

  return (
    <Link href={href} className="btn-ghost mb-3 inline-flex" style={{ padding: "5px 12px", fontSize: 13 }}>
      {label}
    </Link>
  );
}
