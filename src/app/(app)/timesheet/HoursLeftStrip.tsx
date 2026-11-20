import { fmtHrs, fmtRange } from "@/lib/hours";

export type HoursLeftItem = {
  projectId: string;
  name: string;
  color: string;
  weekStart: string;
  weekEnd: string;
  weekAssigned: number;
  weekLogged: number;
  totalAssigned: number;
  totalLogged: number;
};

function Bar({ assigned, logged }: { assigned: number; logged: number }) {
  const pct = assigned > 0 ? Math.min(100, (logged / assigned) * 100) : logged > 0 ? 100 : 0;
  const over = logged > assigned;
  const done = !over && assigned > 0 && logged === assigned;
  return (
    <div className="h-2 w-full rounded-full bg-[#ececE6] overflow-hidden" aria-hidden>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: over ? "#c0392b" : done ? "#2f9e44" : "#2a78d6" }}
      />
    </div>
  );
}

function left(assigned: number, logged: number) {
  const d = assigned - logged;
  return d >= 0 ? `${fmtHrs(d)}h left` : `${fmtHrs(-d)}h over`;
}

// Hours left per campaign: this week (logged vs assigned) and the campaign
// total across all its weeks. Only campaigns with an assigned week running
// today are listed; nothing here limits what an agent can log.
export default function HoursLeftStrip({ items }: { items: HoursLeftItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
      {items.map((it) => (
        <div key={it.projectId} className="rounded-lg border border-[#e1e0d9] bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} />
            <span className="text-[13px] font-semibold truncate">{it.name}</span>
          </div>
          <div className="flex items-baseline justify-between text-[12px] mb-1">
            <span className="text-[#52514e]">This week · {fmtRange(it.weekStart, it.weekEnd)}</span>
          </div>
          <Bar assigned={it.weekAssigned} logged={it.weekLogged} />
          <div className="flex items-baseline justify-between text-[12px] mt-1 tabular-nums">
            <span>
              {fmtHrs(it.weekLogged)} / {fmtHrs(it.weekAssigned)}h
            </span>
            <span className={it.weekLogged > it.weekAssigned ? "text-[#c0392b] font-semibold" : "text-[#52514e]"}>
              {left(it.weekAssigned, it.weekLogged)}
            </span>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#f0efe9] flex items-baseline justify-between text-[11.5px] text-[#52514e] tabular-nums">
            <span>Campaign total</span>
            <span>
              {fmtHrs(it.totalLogged)} / {fmtHrs(it.totalAssigned)}h · {left(it.totalAssigned, it.totalLogged)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
