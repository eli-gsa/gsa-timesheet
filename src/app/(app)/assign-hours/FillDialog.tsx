"use client";

import { useState } from "react";

export type FillTarget = { w: string; a: string };

// Autofill: one value into every cell of the chosen scope (whole campaign, one
// agent across all weeks, or one week across all agents).
export default function FillDialog({
  title,
  kind,
  currency,
  targets,
  hasValue,
  onClose,
  onApply,
}: {
  title: string;
  kind: "hours" | "bonus";
  currency: string;
  targets: FillTarget[];
  hasValue: (w: string, a: string) => boolean;
  onClose: () => void;
  onApply: (chosen: FillTarget[], value: number | null) => void;
}) {
  const [text, setText] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);

  const t = text.trim();
  const raw = t === "" ? null : Number(t);
  const max = kind === "hours" ? 999 : 999999;
  const valid = raw === null || (Number.isFinite(raw) && raw >= 0 && raw <= max);
  // Blank clears; for bonuses 0 also clears (0 = no bonus).
  const value = raw === null || (kind === "bonus" && raw === 0) ? null : raw;
  const clearing = value === null;
  const chosen = clearing ? targets.filter((x) => hasValue(x.w, x.a)) : onlyEmpty ? targets.filter((x) => !hasValue(x.w, x.a)) : targets;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0b0b]/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-semibold mb-0.5">Autofill</h4>
        <p className="text-[12.5px] text-[#52514e] mb-3">{title}</p>

        <label className="block text-[12px] text-[#52514e] mb-2">
          {kind === "hours" ? "Hours" : `Bonus per lead (${currency})`}
          <input
            autoFocus
            value={text}
            inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === "hours" ? "e.g. 20" : "e.g. 5.00"}
            className="mt-1 w-full rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px] text-[#0b0b0b]"
          />
        </label>
        <p className="text-[11.5px] text-[#898781] mb-2">
          {kind === "hours" ? "Leave blank to clear the cells." : "Leave blank or 0 to clear (no bonus). Positive amounts only."}
        </p>
        <label className={`flex items-center gap-1.5 text-[12.5px] mb-3 ${clearing ? "opacity-40" : ""}`}>
          <input type="checkbox" disabled={clearing} checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
          Only fill empty cells (keep existing values)
        </label>

        {!valid && <p className="text-[12px] text-[#8a1f17] mb-2">Enter a number between 0 and {max}.</p>}
        <p className="text-[12px] text-[#52514e] mb-3">
          {clearing ? "Will clear" : "Will set"} <b>{chosen.length}</b> cell{chosen.length === 1 ? "" : "s"}
          {targets.length !== chosen.length ? ` (of ${targets.length})` : ""}. Unassigned agents are skipped.
        </p>

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="rounded-md border border-[#c3c2b7] px-3 py-1.5 text-[12.5px]">
            Cancel
          </button>
          <button
            disabled={!valid || chosen.length === 0 || chosen.length > 5000}
            onClick={() => onApply(chosen, value)}
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
