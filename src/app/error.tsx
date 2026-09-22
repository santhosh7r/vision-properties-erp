"use client";

import ErrorScreen from "@/components/ErrorScreen";

// Catches any uncaught error in a route segment below the root layout that has
// no closer boundary of its own — every page outside the (app) shell (login,
// change-password, receipts, the public feedback form) and anything new added
// later. The raw error is reported; the user sees a sentence and a reference.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} />;
}
