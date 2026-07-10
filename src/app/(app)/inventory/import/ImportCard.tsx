"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui";
import type { ImportResult } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending} aria-busy={pending}>
      {pending ? "Importing…" : label}
    </button>
  );
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
  action: (prev: ImportResult, formData: FormData) => Promise<ImportResult>;
}) {
  const [state, formAction] = useActionState<ImportResult, FormData>(action, null);

  return (
    <div className="rounded-2xl border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <a
          href={`/inventory/import/template?type=${templateType}`}
          className="btn-ghost shrink-0"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          ↓ Download template
        </a>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">{description}</p>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.csv"
          required
          className="text-sm text-[var(--muted)] file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[var(--accent-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--accent)]"
        />
        <SubmitButton label={`Import ${title}`} />
      </form>

      {state && (
        <div className="mt-4">
          {state.ok === false ? (
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                border: "1px solid color-mix(in srgb, var(--brand-red) 35%, transparent)",
                background: "var(--brand-red-soft)",
                color: "var(--brand-red)",
              }}
            >
              {state.error}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge tone="green">{state.created} created</Badge>
                {state.skipped > 0 && <Badge tone="amber">{state.skipped} skipped</Badge>}
              </div>
              {state.errors.length > 0 && (
                <div
                  className="max-h-48 overflow-y-auto rounded-lg border p-3 text-xs text-[var(--muted)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <ul className="space-y-1">
                    {state.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
