"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Project, Rate, TimesheetEntry } from "@/lib/types";
import { fmtHours } from "@/lib/types";

function currentRate(rates: Rate[], agentId: string, projectId: string, dateStr: string): number | null {
  const candidates = rates
    .filter((r) => r.agent_id === agentId && r.project_id === projectId && r.effective_from <= dateStr)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates.length ? candidates[0].rate : null;
}

function slotTime(slot: number) {
  const h = Math.floor(slot / 2);
  const m = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function ReportsClient({
  entries,
  agents,
  projects,
  rates,
  from,
  to,
  agentFilter,
  projectFilter,
}: {
  entries: TimesheetEntry[];
  agents: Agent[];
  projects: Project[];
  rates: Rate[];
  from: string;
  to: string;
  agentFilter: string;
  projectFilter: string;
}) {
  const router = useRouter();
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const rows = useMemo(
    () =>
      entries
        .map((e) => {
          const agent = agentById.get(e.agent_id);
          const project = projectById.get(e.project_id);
          const rate = currentRate(rates, e.agent_id, e.project_id, e.entry_date);
          return {
            date: e.entry_date,
            time: slotTime(e.slot),
            agent: agent?.name ?? e.agent_id,
            project: project?.name ?? e.project_id,
            hours: 0.5,
            rate,
            amount: rate != null ? rate * 0.5 : null,
          };
        })
        .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1)),
    [entries, agentById, projectById, rates]
  );

  const totalHours = rows.reduce((sum, r) => sum + r.hours, 0);
  const totalAmount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams({ from, to, agent: agentFilter, project: projectFilter });
    sp.set(key, value);
    router.push(`/reports?${sp.toString()}`);
  }

  function exportCsv() {
    const header = "Date,Time,Agent,Project,Hours,Rate,Amount";
    const lines = rows.map((r) =>
      [
        r.date,
        r.time,
        csvEscape(r.agent),
        csvEscape(r.project),
        r.hours.toFixed(2),
        r.rate != null ? r.rate.toFixed(2) : "",
        r.amount != null ? r.amount.toFixed(2) : "",
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-[19px] font-semibold">Reports</h2>
        <button
          className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>

      <div className="flex items-end gap-2.5 flex-wrap bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-3 mb-4">
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          From
          <input
            type="date"
            defaultValue={from}
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            onChange={(e) => setParam("from", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          To
          <input
            type="date"
            defaultValue={to}
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            onChange={(e) => setParam("to", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Agent
          <select
            defaultValue={agentFilter}
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            onChange={(e) => setParam("agent", e.target.value)}
          >
            <option value="all">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Project
          <select
            defaultValue={projectFilter}
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            onChange={(e) => setParam("project", e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <Stat label="Entries" value={String(rows.length)} />
        <Stat label="Total hours" value={fmtHours(totalHours)} />
        <Stat label="Total amount" value={totalAmount.toFixed(2)} />
        <Stat label="Date range" value={`${from} – ${to}`} />
      </div>

      <div className="border border-[#e1e0d9] rounded-lg overflow-auto max-h-[60vh]">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="sticky top-0 bg-[#f3f2ee]">
            <tr>
              {["Date", "Time", "Agent", "Project", "Hours", "Rate", "Amount"].map((h) => (
                <th key={h} className="text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] border-b border-[#c3c2b7]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[#e1e0d9] hover:bg-[#f3f2ee]">
                <td className="px-2.5 py-1.5">{r.date}</td>
                <td className="px-2.5 py-1.5">{r.time}</td>
                <td className="px-2.5 py-1.5">{r.agent}</td>
                <td className="px-2.5 py-1.5">{r.project}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{r.hours.toFixed(2)}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{r.rate != null ? r.rate.toFixed(2) : "—"}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{r.amount != null ? r.amount.toFixed(2) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-6 text-center text-[#898781]">
                  No entries in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg px-3.5 py-3">
      <div className="text-[11.5px] text-[#898781]">{label}</div>
      <div className="text-[22px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
