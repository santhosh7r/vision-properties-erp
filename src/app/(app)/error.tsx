"use client";

import ErrorScreen from "@/components/ErrorScreen";

// The boundary for every signed-in page. Kept separate from app/error.tsx so a
// failure inside a feature page is contained BELOW the app shell: the sidebar,
// header and navigation stay on screen and usable, instead of the whole window
// being replaced. A user who hits a broken report can still walk to another page.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} source="rsc" />;
}
