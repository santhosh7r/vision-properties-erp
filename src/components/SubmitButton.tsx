"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "./Spinner";

/**
 * Submit button that shows a spinner and disables itself while the parent
 * <form> action is pending. Prevents duplicate submissions from double-clicks
 * and gives instant feedback on slow server actions. Must be rendered inside a
 * <form action={...}> (Server Action or client action).
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      style={style}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner size={14} />
          {pendingLabel ?? "Saving…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
