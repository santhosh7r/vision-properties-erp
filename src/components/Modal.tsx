"use client";

import { useEffect, type ReactNode } from "react";

// Centered popup over a dimmed backdrop. Closes on backdrop click or Escape;
// the panel scrolls if it's tall. Locks body scroll while open.
export default function Modal({
  children,
  onClose,
  className = "max-w-2xl",
}: {
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div className={`my-4 w-full ${className}`} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
