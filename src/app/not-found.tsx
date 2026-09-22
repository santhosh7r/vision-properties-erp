import Link from "next/link";

// A 404 is not a fault, so it is not logged and does not use the error screen —
// but it does need to exist, or Next.js renders its own bare page with none of
// the app's styling.
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <p className="text-[42px] font-semibold leading-none tracking-tight text-[var(--muted)]">
          404
        </p>
        <h1 className="mt-4 text-[19px] font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          The page you are looking for does not exist, or it may have been moved.
        </p>
        <div className="mt-6">
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
