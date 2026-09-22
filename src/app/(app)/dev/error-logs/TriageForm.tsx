"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import ErrorNotice from "@/components/ErrorNotice";
import { ERROR_STATUSES, STATUS_LABEL, type ErrorStatus } from "@/lib/errors/types";
import type { ErrorKind } from "@/lib/errors/types";
import { updateErrorStatus } from "./actions";

interface Result {
  ok?: boolean;
  error?: string;
  kind?: ErrorKind;
  reference?: string;
}

/**
 * Triage controls for one error group.
 *
 * Note what happens when the triage save itself fails: it renders <ErrorNotice>,
 * exactly like any other page in the app. The Error Logs page is not exempt from
 * the rule it exists to serve — a developer working here still gets the friendly
 * message and a reference, and the failure lands in this very table.
 */
export default function TriageForm({
  id,
  status,
  notes,
}: {
  id: string;
  status: ErrorStatus;
  notes: string | null;
}) {
  const [state, formAction] = useActionState<Result | null, FormData>(
    async (_prev, formData) => (await updateErrorStatus(formData)) as Result,
    null,
  );

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="id" value={id} />

      <div>
        <label className="label" htmlFor="status">
          Status
        </label>
        <select id="status" name="status" className="select" defaultValue={status}>
          {ERROR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="resolution_notes">
          Resolution notes
        </label>
        <textarea
          id="resolution_notes"
          name="resolution_notes"
          className="input"
          rows={4}
          defaultValue={notes ?? ""}
          placeholder="What caused it, what was changed, which release carries the fix…"
        />
      </div>

      {state?.error && (
        <ErrorNotice
          kind={state.kind ?? "unknown"}
          reference={state.reference ?? null}
          subject="error log"
          action="updated"
          compact
        />
      )}
      {state?.ok && (
        <p className="text-xs" style={{ color: "var(--accent)" }}>
          Saved.
        </p>
      )}

      <SubmitButton className="btn-primary w-full">Save</SubmitButton>
    </form>
  );
}
