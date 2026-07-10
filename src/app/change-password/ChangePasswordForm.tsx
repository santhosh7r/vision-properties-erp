"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { forceChangePassword } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save & continue"}
    </button>
  );
}

export default function ChangePasswordForm({ error }: { error: string | null }) {
  const [show, setShow] = useState(false);

  return (
    <form action={forceChangePassword} className="space-y-4">
      <div>
        <label className="label" htmlFor="new_password">New password</label>
        <div className="relative">
          <input
            id="new_password"
            name="new_password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="input"
            style={{ paddingRight: 42 }}
            minLength={8}
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="confirm_password">Confirm new password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Re-enter the new password"
          className="input"
          minLength={8}
          required
        />
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            border: "1px solid color-mix(in srgb, var(--brand-red) 35%, transparent)",
            background: "var(--brand-red-soft)",
            color: "var(--brand-red)",
          }}
        >
          {error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
