"use client";

import ErrorScreen from "@/components/ErrorScreen";
import "./globals.css";

// The last net. Catches errors thrown in the ROOT layout itself — the one place
// app/error.tsx cannot reach, because that boundary lives inside the layout it
// would have to replace. It therefore has to render its own <html>/<body>.
//
// Without this file, a failure in the root layout shows the framework's default
// error page, which in development prints the message and stack to the screen.
// That is precisely the leak this system exists to close.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <ErrorScreen error={error} reset={reset} standalone />
      </body>
    </html>
  );
}
