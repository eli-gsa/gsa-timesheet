"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HOUR_COLOURS,
  addDaysStr,
  cellKey,
  colourOf,
  fmtHrs,
  fmtRange,
  halfToHours,
  nextMonday,
  type HourWeek,
} from "@/lib/hours";
import type { AssignData } from "@/lib/hoursData";
import { COMMON_CURRENCIES, DEFAULT_CURRENCY, formatNumber } from "@/lib/invoicing";
import {
  addWeeks,
  deleteWeek,
  getAssignData,
  setBonus,
  setBonusCurrency,
  setBonusMany,
  setColour,
  setHours,
  setHoursMany,
  updateWeek,
} from "@/lib/actions/hours";
import ExportDialog from "./ExportDialog";
import FillDialog, { type FillTarget } from "./FillDialog";

type P = { id: string; name: string; color: string; active: boolean };
type A = { id: string; name: string; active: boolean };
type View = "hours" | "bonus" | "leads";
type Many = { w: string; a: string; v: number | null }[];
type FillSpec = { title: string; label: string; targets: FillTarget[] };

const VIEWS: { key: View; label: string }[] = [
  { key: "hours", label: "Hours" },
  { key: "bonus", label: "Lead bonus" },
  { key: "leads", label: "Number of leads" },
];

const kv = (rows: { week_id: string; agent_id: string }[], f: (r: never) => number) =>
  Object.fromEntries(rows.map((r) => [cellKey(r.week_id, r.agent_id), f(r as never)]));

export default function AssignHoursClient({
  projects,
  agents,
  initial,
}: {
  projects: P[];
  agents: A[];
  initial: AssignData;
}) {
  const [weeks, setWeeks] = useState<HourWeek[]>(initial.weeks);
  const [cells, setCells] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.cells.map((c) => [cellKey(c.week_id, c.agent_id), c.hours]))
  );
  const [colours, setColours] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.colours.map((c) => [cellKey(c.week_id, c.agent_id), c.colour]))
  );
  const [logged, setLogged] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.logged.map((c) => [cellKey(c.week_id, c.agent_id), c.half_hours]))
  );
  const [assigned, setAssigned] = useState(initial.assigned);
  const [rates, setRates] = useState<Record<string, number>>(() => kv(initial.rates, (r: { amount: number }) => r.amount));
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>(() =>
    kv(initial.leadCounts, (r: { leads: number }) => r.leads)
  );
  const [currencies, setCurrencies] = useState<Record<string, string>>(initial.currencies);
  const [view, setView] = useState<View>("hours");
  const [exportOpen, setExportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [brush, setBrush] = useState<string | null | undefined>(undefined); // undefined = paint off, null = eraser
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const editing = useRef(0); // cells currently focused or mid-save: don't overwrite them with a refresh

  const apply = useCallback((d: AssignData) => {
    setWeeks(d.weeks);
    setCells(Object.fromEntries(d.cells.map((c) => [cellKey(c.week_id, c.agent_id), c.hours])));
    setColours(Object.fromEntries(d.colours.map((c) => [cellKey(c.week_id, c.agent_id), c.colour])));
    setLogged(Object.fromEntries(d.logged.map((c) => [cellKey(c.week_id, c.agent_id), c.half_hours])));
    setAssigned(d.assigned);
    setRates(kv(d.rates, (r: { amount: number }) => r.amount));
    setLeadCounts(kv(d.leadCounts, (r: { leads: number }) => r.leads));
    setCurrencies(d.currencies);
  }, []);

  // Other admins' edits show up on their own: refresh every 30s and when the tab
  // regains focus, but never while someone is typing or a save is in flight.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      if (editing.current > 0 || document.hidden) return;
      try {
        const d = await getAssignData();
        if (alive && editing.current === 0) apply(d);
      } catch {
        /* next tick */
      }
    };
    const t = setInterval(pull, 30000);
    document.addEventListener("visibilitychange", pull);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [apply]);

  const beginEdit = useCallback(() => {
    editing.current++;
  }, []);
  const endEdit = useCallback(() => {
    editing.current--;
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setSaving((n) => n + 1);
    editing.current++;
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      editing.current--;
      setSaving((n) => n - 1);
    }
  }, []);

  const weeksBy = useMemo(() => {
    const m = new Map<string, HourWeek[]>();
    for (const w of weeks) (m.get(w.project_id) ?? m.set(w.project_id, []).get(w.project_id)!).push(w);
    for (const l of m.values()) l.sort((a, b) => a.start_date.localeCompare(b.start_date));
    return m;
  }, [weeks]);

  // Agents that appear in each campaign's tables (for the export selectors).
  const participants = useMemo(() => {
    const weekProject = new Map(weeks.map((w) => [w.id, w.project_id]));
    const m = new Map<string, Set<string>>();
    const add = (pid: string | undefined, aid: string) => {
      if (!pid) return;
      (m.get(pid) ?? m.set(pid, new Set()).get(pid)!).add(aid);
    };
    for (const a of assigned) add(a.project_id, a.agent_id);
    for (const k of [...Object.keys(rates), ...Object.keys(leadCounts)]) {
      const [w, a] = k.split("|");
      add(weekProject.get(w), a);
    }
    return Object.fromEntries(Array.from(m, ([k, v]) => [k, Array.from(v)]));
  }, [weeks, assigned, rates, leadCounts]);

  const q = search.trim().toLowerCase();
  const visible = projects.filter(
    (p) => (p.active || showInactive || weeksBy.has(p.id)) && (!q || p.name.toLowerCase().includes(q))
  ).filter((p) => p.active || showInactive);

  return (
    <div className="max-w-[1400px]">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h2 className="text-lg font-semibold tracking-tight mr-auto">Assign Hours and Lead Bonuses</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] w-56"
        />
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#52514e]">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive campaigns
        </label>
        <span className="text-[12px] text-[#898781] w-16 text-right">{saving > 0 ? "Saving…" : "Saved"}</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="inline-flex rounded-md border border-[#c3c2b7] bg-white p-0.5 text-[12.5px]" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`rounded px-3 py-1 ${view === v.key ? "bg-[#2a78d6] text-white font-semibold" : "text-[#52514e] hover:bg-[#f3f2ee]"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== "hours" && (
          <button
            onClick={() => setExportOpen(true)}
            className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1 text-[12.5px] hover:bg-[#f3f2ee]"
          >
            Export PDF…
          </button>
        )}
        <span className="text-[12px] text-[#898781]">
          {view === "hours" && "Hours assigned per agent per week."}
          {view === "bonus" && "Bonus paid per lead, per agent per week. 0 or blank = no bonus."}
          {view === "leads" && "Leads counted automatically from agents' timesheets (by lead date). Read-only."}
        </span>
      </div>

      {view === "hours" && (
      <div className="flex items-center gap-1.5 flex-wrap mb-4 text-[12.5px]">
        <span className="text-[#52514e] mr-1">Colour brush:</span>
        <button
          onClick={() => setBrush(undefined)}
          className={`rounded-md border px-2 py-1 ${brush === undefined ? "border-[#2a78d6] bg-[#e8f0fb] text-[#2a78d6] font-semibold" : "border-[#c3c2b7] bg-white"}`}
        >
          Off (type hours)
        </button>
        {HOUR_COLOURS.map((c) => (
          <button
            key={c.key}
            onClick={() => setBrush(c.key)}
            title={c.label}
            style={{ background: c.bg, color: c.fg }}
            className={`rounded-md border px-2 py-1 ${brush === c.key ? "border-[#0b0b0b] font-semibold" : "border-transparent"}`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setBrush(null)}
          className={`rounded-md border px-2 py-1 ${brush === null ? "border-[#0b0b0b] font-semibold" : "border-[#c3c2b7]"} bg-white`}
        >
          Clear colour
        </button>
        {brush !== undefined && <span className="text-[#898781] ml-2">Click cells to paint. Colours are only visible to admins.</span>}
      </div>
      )}

      {err && (
        <div className="mb-3 rounded-md border border-[#e5b3ad] bg-[#fbeceb] px-3 py-2 text-[13px] text-[#8a1f17]">
          {err}
        </div>
      )}

      {visible.length === 0 && <p className="text-sm text-[#898781]">No campaigns match.</p>}
      <div className="flex flex-col gap-4">
        {visible.map((p) => (
          <CampaignTable
            key={p.id}
            project={p}
            weeks={weeksBy.get(p.id) ?? []}
            agents={agents}
            assignedIds={new Set(assigned.filter((a) => a.project_id === p.id).map((a) => a.agent_id))}
            cells={cells}
            colours={colours}
            logged={logged}
            rates={rates}
            leadCounts={leadCounts}
            currency={currencies[p.id] ?? DEFAULT_CURRENCY}
            view={view}
            brush={brush}
            forceOpen={q.length > 0}
            run={run}
            beginEdit={beginEdit}
            endEdit={endEdit}
            onCell={(w, a, h) =>
              setCells((c) => {
                const n = { ...c };
                if (h === null) delete n[cellKey(w, a)];
                else n[cellKey(w, a)] = h;
                return n;
              })
            }
            onColour={(w, a, col) =>
              setColours((c) => {
                const n = { ...c };
                if (col === null) delete n[cellKey(w, a)];
                else n[cellKey(w, a)] = col;
                return n;
              })
            }
            onCells={(items) =>
              setCells((c) => {
                const n = { ...c };
                for (const i of items) {
                  if (i.v === null) delete n[cellKey(i.w, i.a)];
                  else n[cellKey(i.w, i.a)] = i.v;
                }
                return n;
              })
            }
            onRates={(items) =>
              setRates((c) => {
                const n = { ...c };
                for (const i of items) {
                  if (i.v === null) delete n[cellKey(i.w, i.a)];
                  else n[cellKey(i.w, i.a)] = i.v;
                }
                return n;
              })
            }
            onCurrency={(c) => setCurrencies((m) => ({ ...m, [p.id]: c }))}
            onWeeks={setWeeks}
          />
        ))}
      </div>

      {exportOpen && (
        <ExportDialog
          projects={projects}
          agents={agents}
          weeks={weeks}
          participants={participants}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}

function CampaignTable({
  project,
  weeks,
  agents,
  assignedIds,
  cells,
  colours,
  logged,
  rates,
  leadCounts,
  currency,
  view,
  brush,
  forceOpen,
  run,
  beginEdit,
  endEdit,
  onCell,
  onColour,
  onCells,
  onRates,
  onCurrency,
  onWeeks,
}: {
  project: P;
  weeks: HourWeek[];
  agents: A[];
  assignedIds: Set<string>;
  cells: Record<string, number>;
  colours: Record<string, string>;
  logged: Record<string, number>;
  rates: Record<string, number>;
  leadCounts: Record<string, number>;
  currency: string;
  view: View;
  brush: string | null | undefined;
  forceOpen: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  beginEdit: () => void;
  endEdit: () => void;
  onCell: (w: string, a: string, h: number | null) => void;
  onColour: (w: string, a: string, c: string | null) => void;
  onCells: (items: Many) => void;
  onRates: (items: Many) => void;
  onCurrency: (c: string) => void;
  onWeeks: React.Dispatch<React.SetStateAction<HourWeek[]>>;
}) {
  const [open, setOpen] = useState(weeks.length > 0);
  const [count, setCount] = useState(4);
  const [editWeek, setEditWeek] = useState<HourWeek | null>(null);
  const [fill, setFill] = useState<FillSpec | null>(null);
  const isOpen = open || forceOpen;
  const hoursView = view === "hours";
  const bonusView = view === "bonus";

  const weekIds = useMemo(() => new Set(weeks.map((w) => w.id)), [weeks]);

  // Rows: agents assigned to the campaign, plus anyone (assigned or not) who
  // holds hours, a bonus or leads in one of its weeks; those no longer assigned
  // are greyed.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    for (const k of Object.keys(cells)) {
      const [w, a] = k.split("|");
      if (weekIds.has(w)) seen.add(a);
    }
    for (const k of Object.keys(rates)) {
      const [w, a] = k.split("|");
      if (weekIds.has(w)) seen.add(a);
    }
    for (const [k, n] of Object.entries(leadCounts)) {
      const [w, a] = k.split("|");
      if (n > 0 && weekIds.has(w)) seen.add(a);
    }
    return agents
      .filter((a) => (assignedIds.has(a.id) && a.active) || seen.has(a.id))
      .map((a) => ({ ...a, unassigned: !assignedIds.has(a.id) }));
  }, [agents, assignedIds, cells, rates, leadCounts, weekIds]);

  const hrs = (w: string, a: string) => cells[cellKey(w, a)] ?? 0;
  const rate = (w: string, a: string) => rates[cellKey(w, a)] ?? 0;
  const leads = (w: string, a: string) => leadCounts[cellKey(w, a)] ?? 0;
  const money = (w: string, a: string) => Math.round(rate(w, a) * leads(w, a) * 100) / 100;

  const weekTotal = (wid: string) => rows.reduce((s, r) => s + hrs(wid, r.id), 0);
  const weekCallers = (wid: string) => rows.filter((r) => hrs(wid, r.id) > 0).length;
  const rowTotal = (aid: string) => weeks.reduce((s, w) => s + hrs(w.id, aid), 0);
  const grand = rows.reduce((s, r) => s + rowTotal(r.id), 0);

  const weekLeads = (wid: string) => rows.reduce((s, r) => s + leads(wid, r.id), 0);
  const rowLeads = (aid: string) => weeks.reduce((s, w) => s + leads(w.id, aid), 0);
  const grandLeads = rows.reduce((s, r) => s + rowLeads(r.id), 0);
  const weekMoney = (wid: string) => rows.reduce((s, r) => s + money(wid, r.id), 0);
  const rowMoney = (aid: string) => weeks.reduce((s, w) => s + money(w.id, aid), 0);
  const grandMoney = rows.reduce((s, r) => s + rowMoney(r.id), 0);

  const active = rows.filter((r) => !r.unassigned && r.active);
  const openFill = (title: string, label: string, ws: HourWeek[], rs: { id: string }[]) =>
    setFill({
      title,
      label,
      targets: ws.flatMap((w) => rs.map((r) => ({ w: w.id, a: r.id }))),
    });

  function add(n: number) {
    run(async () => {
      const created = await addWeeks(project.id, n);
      onWeeks((w) => [...w, ...created]);
      setOpen(true);
    });
  }

  const unit = hoursView ? "h" : bonusView ? currency : "leads";
  const headline = hoursView ? fmtHrs(grand) : bonusView ? formatNumber(grandMoney) : String(grandLeads);

  return (
    <section className="rounded-lg border border-[#e1e0d9] bg-white">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[#e1e0d9] flex-wrap">
        <button onClick={() => setOpen(!isOpen)} className="text-[12px] w-4 text-[#52514e]" aria-label="Toggle">
          {isOpen ? "▾" : "▸"}
        </button>
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: project.color }} />
        <h3 className="text-[14px] font-semibold mr-auto">
          {project.name}
          {!project.active && <span className="ml-2 text-[11px] text-[#898781] font-normal">inactive</span>}
        </h3>
        {bonusView && (
          <label className="flex items-center gap-1.5 text-[12px] text-[#52514e]">
            Currency
            <select
              value={currency}
              onChange={(e) =>
                run(async () => {
                  await setBonusCurrency(project.id, e.target.value);
                  onCurrency(e.target.value);
                })
              }
              className="rounded-md border border-[#c3c2b7] bg-white px-1.5 py-1 text-[12.5px] text-[#0b0b0b]"
            >
              {(COMMON_CURRENCIES.includes(currency) ? COMMON_CURRENCIES : [currency, ...COMMON_CURRENCIES]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        {!(view === "leads") && weeks.length > 0 && (
          <button
            onClick={() => openFill(`${project.name}: all weeks, all agents`, `${project.name} (campaign)`, weeks, active)}
            className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] hover:bg-[#f3f2ee]"
            title="Fill the whole campaign"
          >
            Autofill campaign
          </button>
        )}
        <span className="text-[12px] text-[#898781]">
          {weeks.length} week{weeks.length === 1 ? "" : "s"} · {headline} {unit}
        </span>
      </header>

      {isOpen && (
        <div className="p-3 overflow-x-auto">
          {weeks.length === 0 ? (
            <div className="flex items-center gap-2 text-[13px] text-[#52514e]">
              Set up
              <input
                type="number"
                min={1}
                max={26}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-16 rounded-md border border-[#c3c2b7] px-2 py-1"
              />
              weeks (Mon–Fri, from the next Monday)
              <button
                onClick={() => add(count)}
                className="rounded-md bg-[#2a78d6] text-white px-3 py-1 text-[12.5px] font-semibold"
              >
                Create
              </button>
            </div>
          ) : (
            <>
              <table className="text-[13px] border-separate border-spacing-0 min-w-full">
                <thead>
                  <tr>
                    <th className="text-left font-semibold px-2 py-1.5 border-b border-[#e1e0d9] min-w-[160px]">Agent</th>
                    {weeks.map((w) => (
                      <th key={w.id} className="px-1 py-1.5 border-b border-[#e1e0d9] min-w-[120px]">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setEditWeek(w)}
                            className="flex-1 rounded px-1 py-0.5 text-[12px] font-semibold hover:bg-[#f3f2ee]"
                            title="Edit dates"
                          >
                            {fmtRange(w.start_date, w.end_date)}
                          </button>
                          {view !== "leads" && (
                            <button
                              onClick={() =>
                                openFill(
                                  `${project.name}: ${fmtRange(w.start_date, w.end_date)}, all agents`,
                                  `${project.name} (week ${w.start_date})`,
                                  [w],
                                  active
                                )
                              }
                              className="rounded px-1 text-[11px] text-[#2a78d6] hover:bg-[#e8f0fb]"
                              title="Fill this week for all agents"
                            >
                              Fill
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-2 py-1.5 border-b border-[#e1e0d9] min-w-[70px] text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={weeks.length + 2} className="px-2 py-3 text-[#898781]">
                        No agents are assigned to this campaign.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className={r.unassigned || !r.active ? "opacity-60" : ""}>
                      <td className="px-2 py-1 border-b border-[#f0efe9]">
                        <div className="flex items-center gap-1.5">
                          <span>{r.name}</span>
                          {r.unassigned && (
                            <span className="rounded bg-[#ececE6] px-1.5 py-0.5 text-[10.5px] text-[#52514e]">Unassigned</span>
                          )}
                          {view !== "leads" && !r.unassigned && r.active && (
                            <button
                              onClick={() =>
                                openFill(`${project.name}: ${r.name}, all weeks`, `${project.name} / ${r.name}`, weeks, [r])
                              }
                              className="ml-auto rounded px-1 text-[11px] text-[#2a78d6] hover:bg-[#e8f0fb]"
                              title="Fill all weeks for this agent"
                            >
                              Fill
                            </button>
                          )}
                        </div>
                      </td>
                      {weeks.map((w) =>
                        hoursView ? (
                          <Cell
                            key={`${w.id}|${r.id}|${cells[cellKey(w.id, r.id)] ?? ""}`}
                            value={cells[cellKey(w.id, r.id)]}
                            colour={colours[cellKey(w.id, r.id)]}
                            logged={logged[cellKey(w.id, r.id)]}
                            brush={brush}
                            beginEdit={beginEdit}
                            endEdit={endEdit}
                            onSave={(h) =>
                              run(async () => {
                                await setHours(w.id, r.id, h);
                                onCell(w.id, r.id, h);
                              })
                            }
                            onPaint={() => {
                              if (brush === undefined) return;
                              const col = brush;
                              run(async () => {
                                await setColour(w.id, r.id, col);
                                onColour(w.id, r.id, col);
                              });
                            }}
                          />
                        ) : bonusView ? (
                          <BonusCell
                            key={`${w.id}|${r.id}|${rates[cellKey(w.id, r.id)] ?? ""}`}
                            value={rates[cellKey(w.id, r.id)]}
                            leads={leads(w.id, r.id)}
                            beginEdit={beginEdit}
                            endEdit={endEdit}
                            onSave={(amt) =>
                              run(async () => {
                                await setBonus(w.id, r.id, amt);
                                onRates([{ w: w.id, a: r.id, v: amt }]);
                              })
                            }
                          />
                        ) : (
                          <td key={w.id} className="px-2 py-1 border-b border-[#f0efe9] text-center tabular-nums">
                            {leads(w.id, r.id) || <span className="text-[#c3c2b7]">0</span>}
                          </td>
                        )
                      )}
                      <td className="px-2 py-1 border-b border-[#f0efe9] text-right font-semibold tabular-nums">
                        {hoursView ? fmtHrs(rowTotal(r.id)) : bonusView ? formatNumber(rowMoney(r.id)) : rowLeads(r.id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="px-2 py-1.5">{hoursView ? "Total hours" : bonusView ? `Total bonus (${currency})` : "Total leads"}</td>
                    {weeks.map((w) => (
                      <td key={w.id} className="px-2 py-1.5 text-center tabular-nums">
                        {hoursView ? fmtHrs(weekTotal(w.id)) : bonusView ? formatNumber(weekMoney(w.id)) : weekLeads(w.id)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {hoursView ? fmtHrs(grand) : bonusView ? formatNumber(grandMoney) : grandLeads}
                    </td>
                  </tr>
                  {hoursView && (
                    <tr className="text-[#52514e]">
                      <td className="px-2 py-1">Callers</td>
                      {weeks.map((w) => (
                        <td key={w.id} className="px-2 py-1 text-center tabular-nums">
                          {weekCallers(w.id)}
                        </td>
                      ))}
                      <td />
                    </tr>
                  )}
                  {bonusView && (
                    <tr className="text-[#52514e]">
                      <td className="px-2 py-1">Leads</td>
                      {weeks.map((w) => (
                        <td key={w.id} className="px-2 py-1 text-center tabular-nums">
                          {weekLeads(w.id)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right tabular-nums">{grandLeads}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
              <div className="mt-2 flex items-center gap-2 text-[12.5px]">
                <button onClick={() => add(1)} className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1 hover:bg-[#f3f2ee]">
                  + Add week
                </button>
                <span className="text-[#898781]">
                  Next default: {fmtRange(nextMonday(weeks[weeks.length - 1].end_date), addDaysStr(nextMonday(weeks[weeks.length - 1].end_date), 4))}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {fill && (
        <FillDialog
          title={fill.title}
          kind={hoursView ? "hours" : "bonus"}
          currency={currency}
          targets={fill.targets}
          hasValue={(w, a) => (hoursView ? cells[cellKey(w, a)] !== undefined : rates[cellKey(w, a)] !== undefined)}
          onClose={() => setFill(null)}
          onApply={(chosen, value) =>
            run(async () => {
              if (hoursView) {
                await setHoursMany(
                  chosen.map((c) => ({ weekId: c.w, agentId: c.a, hours: value })),
                  fill.label
                );
                onCells(chosen.map((c) => ({ w: c.w, a: c.a, v: value })));
              } else {
                await setBonusMany(
                  chosen.map((c) => ({ weekId: c.w, agentId: c.a, amount: value })),
                  fill.label
                );
                onRates(chosen.map((c) => ({ w: c.w, a: c.a, v: value })));
              }
              setFill(null);
            })
          }
        />
      )}

      {editWeek && (
        <WeekEditor
          key={editWeek.id}
          week={editWeek}
          onClose={() => setEditWeek(null)}
          onSave={(s, e) =>
            run(async () => {
              await updateWeek(editWeek.id, s, e);
              onWeeks((ws) => ws.map((w) => (w.id === editWeek.id ? { ...w, start_date: s, end_date: e } : w)));
              setEditWeek(null);
            })
          }
          onDelete={() =>
            run(async () => {
              await deleteWeek(editWeek.id);
              onWeeks((ws) => ws.filter((w) => w.id !== editWeek.id));
              setEditWeek(null);
            })
          }
        />
      )}
    </section>
  );
}

// Bonus per lead for one agent in one week. Positive only; 0 or blank clears it.
function BonusCell({
  value,
  leads,
  beginEdit,
  endEdit,
  onSave,
}: {
  value: number | undefined;
  leads: number;
  beginEdit: () => void;
  endEdit: () => void;
  onSave: (amount: number | null) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : fmtHrs(value));

  function commit() {
    endEdit();
    const t = text.trim();
    const n = t === "" ? null : Number(t);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 999999)) {
      setText(value === undefined ? "" : fmtHrs(value));
      return;
    }
    const next = n === null || n === 0 ? null : n;
    if ((next ?? null) === (value ?? null)) {
      if (n === 0 || n === null) setText("");
      return;
    }
    onSave(next);
  }

  const total = Math.round((value ?? 0) * leads * 100) / 100;
  return (
    <td className="px-1 py-1 border-b border-[#f0efe9]">
      <input
        value={text}
        inputMode="decimal"
        placeholder="0"
        onFocus={beginEdit}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-center tabular-nums placeholder:text-[#c3c2b7] hover:border-[#c3c2b7] focus:border-[#2a78d6] focus:bg-white focus:outline-none"
      />
      <div className="text-center text-[10.5px] leading-tight tabular-nums text-[#898781]" title="Leads in this week = total bonus">
        ({leads} lead{leads === 1 ? "" : "s"}{value !== undefined ? ` = ${formatNumber(total)}` : ""})
      </div>
    </td>
  );
}

function Cell({
  value,
  colour,
  logged,
  brush,
  beginEdit,
  endEdit,
  onSave,
  onPaint,
}: {
  value: number | undefined;
  colour: string | undefined;
  logged: number | undefined;
  brush: string | null | undefined;
  beginEdit: () => void;
  endEdit: () => void;
  onSave: (h: number | null) => void;
  onPaint: () => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : fmtHrs(value));
  const c = colourOf(colour);
  const painting = brush !== undefined;

  function commit() {
    endEdit();
    const t = text.trim();
    const n = t === "" ? null : Number(t);
    if (n !== null && !Number.isFinite(n)) {
      setText(value === undefined ? "" : fmtHrs(value));
      return;
    }
    if ((n ?? null) === (value ?? null)) return;
    onSave(n);
  }

  return (
    <td
      className="px-1 py-1 border-b border-[#f0efe9]"
      style={c ? { background: c.bg } : undefined}
      onClick={painting ? onPaint : undefined}
    >
      <input
        value={text}
        inputMode="decimal"
        readOnly={painting}
        onFocus={beginEdit}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-center tabular-nums hover:border-[#c3c2b7] focus:border-[#2a78d6] focus:bg-white focus:outline-none ${painting ? "cursor-pointer" : ""}`}
        style={c ? { color: c.fg } : undefined}
      />
      <div
        className="text-center text-[10.5px] leading-tight tabular-nums text-[#898781]"
        title="Hours logged so far in this week (UK dates)"
        style={c ? { color: c.fg, opacity: 0.75 } : undefined}
      >
        ({fmtHrs(halfToHours(logged ?? 0))})
      </div>
    </td>
  );
}

function WeekEditor({
  week,
  onClose,
  onSave,
  onDelete,
}: {
  week: HourWeek;
  onClose: () => void;
  onSave: (s: string, e: string) => void;
  onDelete: () => void;
}) {
  const [s, setS] = useState(week.start_date);
  const [e, setE] = useState(week.end_date);
  const [confirm, setConfirm] = useState(false);
  const bad = !s || !e || s > e;
  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0b0b]/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
        <h4 className="font-semibold mb-3">Edit week</h4>
        <div className="flex gap-3 mb-2">
          <label className="flex-1 text-[12px] text-[#52514e]">
            Starts
            <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} className="mt-1 w-full rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]" />
          </label>
          <label className="flex-1 text-[12px] text-[#52514e]">
            Ends
            <input type="date" value={e} onChange={(ev) => setE(ev.target.value)} className="mt-1 w-full rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]" />
          </label>
        </div>
        {!bad && <p className="text-[12px] text-[#898781] mb-3">{fmtRange(s, e)}</p>}
        {bad && <p className="text-[12px] text-[#8a1f17] mb-3">A week can&apos;t end before it starts.</p>}
        <div className="flex items-center gap-2">
          {confirm ? (
            <button onClick={onDelete} className="rounded-md bg-[#c0392b] text-white px-3 py-1.5 text-[12.5px] font-semibold">
              Delete week and its hours?
            </button>
          ) : (
            <button onClick={() => setConfirm(true)} className="rounded-md border border-[#e5b3ad] text-[#8a1f17] px-3 py-1.5 text-[12.5px]">
              Delete week
            </button>
          )}
          <span className="mr-auto" />
          <button onClick={onClose} className="rounded-md border border-[#c3c2b7] px-3 py-1.5 text-[12.5px]">
            Cancel
          </button>
          <button
            disabled={bad}
            onClick={() => onSave(s, e)}
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
