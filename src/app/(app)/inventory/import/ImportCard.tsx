"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ImportState } from "./actions";

// ONE-STEP import. Pick the file, press Upload. The server reads the whole sheet
// and validates every row FIRST: if anything is wrong the entire upload is
// refused and nothing is written, so a sheet can never land half-imported. Only
// a completely clean file is saved, and it is saved in a single statement.
//
// There is deliberately no separate "check" button — checking always happens, so
// making it a button only added a step the user could skip.

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending} aria-busy={pending}>
      {pending ? "Checking & importing…" : "Upload & import"}
    </button>
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
  // Bumped after a successful import so the file input clears — re-submitting
  // the same file would only be refused as duplicate anyway.
  const [formKey, setFormKey] = useState(0);
  // Hide the previous result the moment a different file is picked, so an old
  // error list is never read as belonging to the file now selected.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state?.phase === "imported") setFormKey((k) => k + 1);
  }, [state]);

  const report = state?.phase === "invalid" ? state.report : null;

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

      <form
        key={formKey}
        action={formAction}
        onSubmit={() => setDirty(false)}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          type="file"
          name="file"
          accept=".xlsx,.csv"
          required
          onChange={() => setDirty(true)}
          className="text-sm text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)]"
        />
        <UploadButton />
      </form>

      {!dirty && (
        <div className="mt-4 space-y-3">
          {state?.phase === "rejected" && (
            <Notice tone="red">
              <strong>Nothing was saved.</strong> {state.error}
            </Notice>
          )}

          {state?.phase === "imported" && (
            <Notice tone="green">
              <strong>
                Imported {state.created} {state.created === 1 ? "row" : "rows"}
              </strong>{" "}
              from {state.fileName}. Uploading the same file again will be refused as duplicate, so
              it is safe to keep.
            </Notice>
          )}

          {report && (
            <>
              <Notice tone="red">
                <strong>Nothing was saved.</strong> {report.fileName} has {report.issues.length}{" "}
                {report.issues.length === 1 ? "problem" : "problems"} across {report.totalRows}{" "}
                {report.totalRows === 1 ? "row" : "rows"}. The whole file is refused until every
                problem below is fixed — correct the sheet and upload it again.
              </Notice>
              <div
                className="max-h-72 overflow-y-auto rounded-lg border text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full">
                  <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Row</th>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">What to correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.map((it, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text)]">
                          {it.row ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{it.column}</td>
                        <td className="px-3 py-2 text-[var(--text)]">{it.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
