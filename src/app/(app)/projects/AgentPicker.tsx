"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/lib/types";

// Multi-select dropdown for assigning agents to a project: a button showing
// how many are assigned, opening a panel with a search box and a checkbox per
// agent. Ticking saves straight away (as the old chips did); "Select all
// shown" / "Clear shown" act on whatever the search currently matches.
export default function AgentPicker({
  agents,
  assignedIds,
  disabled,
  onToggle,
  onSetMany,
}: {
  agents: Agent[];
  assignedIds: Set<string>;
  disabled: boolean;
  onToggle: (agentId: string, assigned: boolean) => void;
  onSetMany: (agentIds: string[], assigned: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? agents.filter((a) => a.name.toLowerCase().includes(t) || a.email.toLowerCase().includes(t)) : agents;
  }, [agents, q]);
  const shownAssigned = shown.filter((a) => assignedIds.has(a.id)).length;

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        className="rounded-md border border-[#c3c2b7] bg-white px-3 py-1.5 text-[13px] hover:bg-[#f3f2ee] inline-flex items-center gap-2 min-w-[240px] justify-between"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {assignedIds.size === 0
            ? "No agents assigned"
            : `${assignedIds.size} of ${agents.length} agent${agents.length === 1 ? "" : "s"} assigned`}
        </span>
        <span className="text-[#898781]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-[320px] bg-white border border-[#c3c2b7] rounded-lg shadow-lg">
          <div className="p-2 border-b border-[#e1e0d9]">
            <input
              ref={searchRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agents…"
              className="w-full rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            />
            <div className="flex items-center justify-between mt-1.5 text-[11.5px] text-[#52514e]">
              <span>
                {shownAssigned} of {shown.length} shown ticked
              </span>
              <span className="flex gap-3">
                <button
                  type="button"
                  className="text-[#2a78d6] hover:underline disabled:opacity-50"
                  disabled={disabled || shown.length === 0 || shownAssigned === shown.length}
                  onClick={() => onSetMany(shown.filter((a) => !assignedIds.has(a.id)).map((a) => a.id), true)}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className="text-[#2a78d6] hover:underline disabled:opacity-50"
                  disabled={disabled || shownAssigned === 0}
                  onClick={() => onSetMany(shown.filter((a) => assignedIds.has(a.id)).map((a) => a.id), false)}
                >
                  Clear shown
                </button>
              </span>
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {shown.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-[#898781]">No agents match “{q}”.</p>
            ) : (
              shown.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-[#f3f2ee] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={assignedIds.has(a.id)}
                    disabled={disabled}
                    onChange={(e) => onToggle(a.id, e.target.checked)}
                  />
                  <span className="flex-1 truncate">{a.name}</span>
                  {!a.active && <span className="text-[10.5px] text-[#898781]">archived</span>}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
