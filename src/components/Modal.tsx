"use client";

import { useEffect } from "react";

// Shared dialog shell used by every modal in the app (stat tile zooms, chart
// zooms, agent/project list popups, delete confirmations, etc). Mirrors the
// prototype's uiDialog(): a dimmed overlay, a boxed panel with a close X,
// click-outside-to-close, and Escape-to-close.
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 480,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-start justify-center z-50 pt-16 px-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-[#fcfcfb] border border-[#c3c2b7] rounded-xl p-4.5 w-full my-auto"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-2.5 right-2.5 w-7 h-7 text-[#898781] text-lg leading-none hover:text-[#0b0b0b]"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h3 className="text-[15px] font-semibold mb-1 pr-6">{title}</h3>
        {subtitle && <p className="text-[12px] text-[#898781] mb-3">{subtitle}</p>}
        <div>{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalButton({
  children,
  onClick,
  variant = "subtle",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "subtle" | "danger";
  disabled?: boolean;
}) {
  const cls =
    variant === "primary"
      ? "bg-[#2a78d6] text-white"
      : variant === "danger"
      ? "bg-white border border-[#c3c2b7] text-[#d03b3b]"
      : "bg-white border border-[#c3c2b7] text-[#0b0b0b]";
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${cls}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// A row in an agent/project list modal (badge + name button + optional
// trailing hours), matching the prototype's agentListModal() rows.
export function ListRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[#f3f2ee] text-[12.5px]">
      {children}
    </div>
  );
}

export function RoleBadge({ role }: { role: "admin" | "agent" }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
        role === "admin" ? "bg-[#e8f0fb] text-[#2a78d6]" : "bg-[#ececE6] text-[#52514e]"
      }`}
    >
      {role}
    </span>
  );
}
