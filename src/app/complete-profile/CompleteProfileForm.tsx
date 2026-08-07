"use client";

import { useActionState } from "react";
import PartnerRegistrationFields, {
  type RegistrationDefaults,
} from "@/components/PartnerRegistrationFields";
import { SubmitButton } from "@/components/SubmitButton";
import { completeProfile, type CompleteProfileState } from "./actions";

export default function CompleteProfileForm({ defaults }: { defaults: RegistrationDefaults }) {
  const [state, formAction] = useActionState<CompleteProfileState | undefined, FormData>(
    completeProfile,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-5">
      {/* No email field: the account is already signed in and its email IS the
          login. No role or manager field either — placement stays an admin
          decision, never something a user can edit about themselves. */}
      <PartnerRegistrationFields showReference={false} showEmail={false} defaults={defaults} />

      {state?.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton className="btn-primary w-full" pendingLabel="Saving…">
        Save and continue
      </SubmitButton>
    </form>
  );
}
