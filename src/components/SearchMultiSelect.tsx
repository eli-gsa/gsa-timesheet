"use client";

import { useEffect, useRef, useState } from "react";

export type MsOption = { id: string; label: string; hint?: string; group?: string };

// Searchable multi-select dropdown. "Select all" ticks every option that matches
// the current search; individual boxes can still be unticked afterwards.
export default function SearchMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  allLabel = "all",
  width = 280,
}: {
  options: MsOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const sel = new Set(selected);
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || o.label.toLowerCase().includes(needle));
  const allShownOn = shown.length > 0 && shown.every((o) => sel.has(o.id));

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(options.filter((o) => n.has(o.id)).map((o) => o.id));
  };
  const selectShown = () => {
    const n = new Set(sel);
    for (const o of shown) n.add(o.id);
    onChange(options.filter((o) => n.has(o.id)).map((o) => o.id));
  };
  const clearShown = () => {
    const n = new Set(sel);
    for (const o of shown) n.delete(o.id);
    onChange(options.filter((o) => n.has(o.id)).map((o) => o.id));
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === options.length && options.length > 1
        ? `All ${allLabel} (${options.length})`
        : selected.length <= 2
          ? options.filter((o) => sel.has(o.id)).map((o) => o.label).join(", ")
          : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative inline-block" style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] text-left"
      >
        <span className={`truncate ${selected.length === 0 ? "text-[#898781]" : ""}`}>{summary}</span>
        <span className="text-[10px] text-[#898781]">▾</span>
      </button>
      {open && (
        <div className="absolute z-[120] mt-1 w-full rounded-lg border border-[#c3c2b7] bg-white shadow-lg">
          <div className="p-2 border-b border-[#e1e0d9]">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]"
            />
            <div className="flex items-center gap-3 mt-2 text-[12px]">
              <button type="button" className="text-[#2a78d6] hover:underline" onClick={allShownOn ? clearShown : selectShown}>
                {allShownOn ? "Deselect all" : needle ? "Select all shown" : "Select all"}
              </button>
              <button type="button" className="text-[#52514e] hover:underline" onClick={() => onChange([])}>
                Clear
              </button>
              <span className="ml-auto text-[#898781]">{selected.length} selected</span>
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-2 text-[12.5px] text-[#898781]">No matches.</p>}
            {shown.map((o, i) => {
              const header = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              return (
                <div key={o.id}>
                  {header && (
                    <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#898781]">
                      {header}
                    </div>
                  )}
                  <label className="flex items-center gap-2 px-3 py-1 text-[13px] hover:bg-[#f3f2ee] cursor-pointer">
                    <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto text-[11px] text-[#898781]">{o.hint}</span>}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
