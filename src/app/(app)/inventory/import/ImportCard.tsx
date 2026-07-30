"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui";
import type { ImportState } from "./actions";

// Two-step import. Step 1 checks the file and saves nothing; step 2 only exists
// once the check came back clean. A file with any problem can never be
// committed — the user fixes their sheet and checks it again.

function Buttons({ canImport }: { canImport: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="submit" name="mode" value="check" className="btn-ghost" disabled={pending} aria-busy={pending}>
        {pending ? "Checking…" : "Check file"}
      </button>
      {canImport && (
        <button type="submit" name="mode" value="commit" className="btn-primary" disabled={pending} aria-busy={pending}>
          {pending ? "Importing…" : "Confirm & import"}
        </button>
      )}
    </div>
  );
}

// Same palette the Badge tones use, so notices sit with the rest of the UI.
const NOTICE_TONE = {
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function Notice({ tone, children }: { tone: keyof typeof NOTICE_TONE; children: React.ReactNode }) {
  return <div className={`rounded-lg border px-3 py-2 text-sm ${NOTICE_TONE[tone]}`}>{children}</div>;
}

export default function ImportCard({
  title,
  description,
  templateType,
  action,
}: {
  title: string;
  description: string;
  templateType: "project" | "plot";
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction] = useActionState<ImportState, FormData>(action, null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Picking a different file invalidates the last check — you must re-check
  // before the import button comes back.
  const [staleCheck, setStaleCheck] = useState(false);

  const report = state?.phase === "checked" ? state.report : null;
  const clean = !!report && report.issues.length === 0;
  const canImport = clean && !staleCheck;

  return (
    <div className="rounded-2xl border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <a
          href={`/inventory/import/template?type=${templateType}`}
          className="btn-ghost shrink-0"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          ↓ Download Excel template
        </a>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">{description}</p>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".xlsx,.csv"
          required
          onChange={() => setStaleCheck(true)}
          className="text-sm text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)]"
        />
        <Buttons canImport={canImport} />
      </form>

      <div className="mt-4 space-y-3">
        {state?.phase === "rejected" && <Notice tone="red">{state.error}</Notice>}

        {state?.phase === "imported" && (
          <Notice tone="green">
            Imported {state.created} {state.created === 1 ? "row" : "rows"} from {state.fileName}. Uploading the same
            file again will be rejected as duplicate, so it is safe to keep.
          </Notice>
        )}

        {report && report.issues.length > 0 && (
          <>
            <Notice tone="red">
              <strong>Nothing was saved.</strong> This file has {report.issues.length}{" "}
              {report.issues.length === 1 ? "problem" : "problems"} across {report.totalRows}{" "}
              {report.totalRows === 1 ? "row" : "rows"}. Correct the sheet, then check it again.
            </Notice>
            <div
              className="max-h-64 overflow-y-auto rounded-lg border text-xs"
              style={{ borderColor: "var(--border)" }}
            >
              <table className="w-full">
                <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Row</th>
                    <th className="px-3 py-2 text-left font-medium">Column</th>
                    <th className="px-3 py-2 text-left font-medium">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {report.issues.map((it, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text)]">{it.row ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{it.column}</td>
                      <td className="px-3 py-2 text-[var(--text)]">{it.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {clean && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="green">{report.totalRows} ready</Badge>
              <span className="text-[var(--muted)]">
                No problems found in {report.fileName}. Nothing is saved yet — press{" "}
                <strong>Confirm &amp; import</strong> to write {report.totalRows === 1 ? "this row" : "these rows"}.
              </span>
            </div>
            {staleCheck && <Notice tone="amber">You picked a different file — press <strong>Check file</strong> again.</Notice>}
            {report.previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-lg border text-xs" style={{ borderColor: "var(--border)" }}>
                <table className="w-full">
                  <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
                    <tr>
                      {report.previewHeaders.map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.previewRows.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        {r.map((c, j) => (
                          <td key={j} className="whitespace-nowrap px-3 py-2 text-[var(--text)]">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.totalRows > report.previewRows.length && (
                  <p className="px-3 py-2 text-[var(--muted)]">
                    Showing the first {report.previewRows.length} of {report.totalRows} rows.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
