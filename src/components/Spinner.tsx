// A lightweight spinner ring. Uses Tailwind's built-in `animate-spin`. Pure
// (no client hooks) so it can be used in server components and loading.tsx.
export function Spinner({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Centered full-area loading state used by route-level loading.tsx files.
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-[var(--muted)]">
      <Spinner size={30} className="opacity-70" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
