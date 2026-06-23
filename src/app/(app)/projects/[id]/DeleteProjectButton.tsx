"use client";

import { useFormStatus } from "react-dom";
import { Trash } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { deleteProject } from "../actions";

function DeleteButton({ name, compact }: { name: string; compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-ghost"
      title="Delete project"
      aria-label={`Delete project ${name}`}
      style={{
        color: "var(--danger, #f87171)",
        ...(compact ? { padding: "6px", lineHeight: 0 } : {}),
      }}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        if (!confirm(`Delete project “${name}”? This also removes all its plots. This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? <Spinner size={16} /> : <Trash size={16} />}
    </button>
  );
}

export default function DeleteProjectButton({
  id,
  name,
  compact,
}: {
  id: string;
  name: string;
  compact?: boolean;
}) {
  return (
    <form action={deleteProject} onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="id" value={id} />
      <DeleteButton name={name} compact={compact} />
    </form>
  );
}
