"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Project, TimesheetEntry } from "@/lib/types";
import { fmtHours } from "@/lib/types";
import { BarChartH, ChartLegend, LineChartMulti } from "@/components/charts";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function ReportsClient({
  entries,
  agents,
  projects,
  from,
  to,
  agentFilter,
  projectFilter,
}: {
  entries: TimesheetEntry[];
  agents: Agent[];
  projects: Project[];
  from: string;
  to: string;
  agentFilter: string;
  projectFilter: string;
}) {
  const router = useRouter();
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const computed = useMemo(() => {
    const totalHours = entries.length * 0.5;
    const daysSet = new Set(entries.map((e) => e.entry_date));
    const projSet = new Set(entries.map((e) => e.project_id));
    const personSet = new Set(entries.map((e) => e.agent_id));
    const avgPerDay = daysSet.size ? totalHours / daysSet.size : 0;

    const byProj = new Map<string, number>();
    entries.forEach((e) => byProj.set(e.project_id, (byProj.get(e.project_id) ?? 0) + 0.5));
    const byProjData = Array.from(byProj.entries())
      .map(([pid, value]) => {
        const p = projectById.get(pid);
        return { id: pid, label: p?.name ?? pid, value, color: p?.color ?? "#2a78d6" };
      })
      .sort((a, b) => b.value - a.value);

    const byPerson = new Map<string, number>();
    entries.forEach((e) => byPerson.set(e.agent_id, (byPerson.get(e.agent_id) ?? 0) + 0.5));
    const byPersonData = Array.from(byPerson.entries())
      .map(([uid, value]) => {
        const u = agentById.get(uid);
        return { label: u?.name ?? uid, value, color: "#2a78d6" };
      })
      .sort((a, b) => b.value - a.value);

    const persons = Array.from(personSet)
      .map((id) => agentById.get(id))
      .filter((a): a is Agent => !!a)
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    const projs = Array.from(projSet)
      .map((id) => projectById.get(id))
      .filter((p): p is Project => !!p);
    const pivot = new Map<string, number>();
    entries.forEach((e) => {
      const k = `${e.agent_id}|${e.project_id}`;
      pivot.set(k, (pivot.get(k) ?? 0) + 0.5);
    });

    // trend bucketing: day / week / month depending on the span
    const fromDt = new Date(`${from}T00:00:00`);
    const toDt = new Date(`${to}T00:00:00`);
    const spanDays = Math.max(1, Math.round((toDt.getTime() - fromDt.getTime()) / 86400000));
    const bucket: "day" | "week" | "month" = spanDays <= 45 ? "day" : spanDays <= 210 ? "week" : "month";
    function bucketKeyFor(dateStr: string) {
      if (bucket === "day") return dateStr;
      if (bucket === "week") {
        const d = new Date(`${dateStr}T00:00:00`);
        const day = (d.getDay() + 6) % 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - day);
        return monday.toISOString().slice(0, 10);
      }
      return dateStr.slice(0, 7);
    }
    const seenB = new Set<string>();
    const buckets: string[] = [];
    entries
      .slice()
      .sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1))
      .forEach((e) => {
        const bk = bucketKeyFor(e.entry_date);
        if (!seenB.has(bk)) {
          seenB.add(bk);
          buckets.push(bk);
        }
      });
    buckets.sort();
    const bucketLabels = buckets.map((bk) => {
      if (bucket === "month") return monthLabel(bk).split(" ")[0] + " " + bk.slice(2, 4);
      const d = new Date(`${bk}T00:00:00`);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    });
    const topProjects = byProjData.slice(0, 7);
    const trendSeries = topProjects.map((tp) => ({
      name: tp.label,
      color: tp.color,
      values: buckets.map((bk) => {
        let sum = 0;
        entries.forEach((e) => {
          if (e.project_id === tp.id && bucketKeyFor(e.entry_date) === bk) sum += 0.5;
        });
        return sum;
      }),
    }));

    // monthly breakdown - always by calendar month regardless of the trend bucket
    const byMonth = new Map<string, Map<string, number>>();
    entries.forEach((e) => {
      const mk = e.entry_date.slice(0, 7);
      if (!byMonth.has(mk)) byMonth.set(mk, new Map());
      const m = byMonth.get(mk)!;
      m.set(e.project_id, (m.get(e.project_id) ?? 0) + 0.5);
    });
    const monthKeys = Array.from(byMonth.keys()).sort();
    const monthly = monthKeys.map((mk) => {
      const m = byMonth.get(mk)!;
      const monthEntries = Array.from(m.entries())
        .map(([pid, hours]) => {
          const p = projectById.get(pid);
          return { name: p?.name ?? pid, hours, color: p?.color ?? "#2a78d6" };
        })
        .sort((a, b) => b.hours - a.hours);
      const total = monthEntries.reduce((a, b) => a + b.hours, 0);
      return { month: mk, entries: monthEntries, total };
    });

    return {
      totalHours,
      daysWorked: daysSet.size,
      avgPerDay,
      projectsTouched: projSet.size,
      byProjData,
      byPersonData,
      persons,
      projs,
      pivot,
      bucket,
      bucketLabels,
      trendSeries,
      monthly,
    };
  }, [entries, agentById, projectById, from, to]);

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams({ from, to, agent: agentFilter, project: projectFilter });
    sp.set(key, value);
    router.push(`/reports?${sp.toString()}`);
  }

  function exportCsv() {
    const header = "Date,Time,Agent,Project,Hours";
    const lines = entries
      .slice()
      .sort((a, b) => (a.entry_date + a.slot < b.entry_date + b.slot ? -1 : 1))
      .map((e) => {
        const agent = agentById.get(e.agent_id);
        const project = projectById.get(e.project_id);
        const h = Math.floor(e.slot / 2);
        const min = (e.slot % 2) * 30;
        const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        return [e.entry_date, time, csvEscape(agent?.name ?? e.agent_id), csvEscape(project?.name ?? e.project_id), "0.5"].join(
          ","
        );
      });
    const csv = [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-export-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-[19px] font-semibold">Reports</h2>
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
          Person
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
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-3 py-1.5 text-[13px] font-semibold ml-auto"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <Stat label="Total hours" value={fmtHours(computed.totalHours)} />
        <Stat label="Distinct days worked" value={String(computed.daysWorked)} />
        <Stat label="Avg hours / day worked" value={fmtHours(computed.avgPerDay)} />
        <Stat label="Projects touched" value={String(computed.projectsTouched)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
          <h3 className="text-[13.5px] font-semibold mb-3">Hours by project</h3>
          {computed.byProjData.length ? (
            <BarChartH data={computed.byProjData} fmt={fmtHours} />
          ) : (
            <p className="text-[12.5px] text-[#898781]">No data.</p>
          )}
        </div>
        <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
          <h3 className="text-[13.5px] font-semibold mb-3">Per-person hours (utilization)</h3>
          {computed.byPersonData.length ? (
            <BarChartH data={computed.byPersonData} fmt={fmtHours} />
          ) : (
            <p className="text-[12.5px] text-[#898781]">No data.</p>
          )}
        </div>
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4 mb-5">
        <h3 className="text-[13.5px] font-semibold mb-3">Hours by person × project</h3>
        {computed.persons.length && computed.projs.length ? (
          <div className="overflow-x-auto border border-[#e1e0d9] rounded-lg">
            <table className="w-full text-[12.5px] border-collapse">
              <thead className="bg-[#f3f2ee]">
                <tr>
                  <th className="text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] border-b border-[#c3c2b7]">
                    Agent
                  </th>
                  {computed.projs.map((p) => (
                    <th
                      key={p.id}
                      className="text-right px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] border-b border-[#c3c2b7]"
                    >
                      {p.name}
                    </th>
                  ))}
                  <th className="text-right px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] border-b border-[#c3c2b7]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {computed.persons.map((u) => {
                  let rowTotal = 0;
                  return (
                    <tr key={u.id} className="border-b border-[#e1e0d9]">
                      <td className="px-2.5 py-1.5">{u.name}</td>
                      {computed.projs.map((p) => {
                        const v = computed.pivot.get(`${u.id}|${p.id}`) ?? 0;
                        rowTotal += v;
                        return (
                          <td key={p.id} className="px-2.5 py-1.5 text-right tabular-nums">
                            {v ? fmtHours(v) : "–"}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{fmtHours(rowTotal)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-[#f3f2ee]">
                  <td className="px-2.5 py-1.5 font-semibold">Total</td>
                  {computed.projs.map((p) => {
                    let colTotal = 0;
                    computed.persons.forEach((u) => (colTotal += computed.pivot.get(`${u.id}|${p.id}`) ?? 0));
                    return (
                      <td key={p.id} className="px-2.5 py-1.5 text-right tabular-nums font-semibold">
                        {fmtHours(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">
                    {fmtHours(computed.totalHours)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12.5px] text-[#898781]">No entries in this range.</p>
        )}
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4 mb-5">
        <h3 className="text-[13.5px] font-semibold mb-3">
          Hours by project over time <span className="font-normal text-[#898781]">(by {computed.bucket})</span>
        </h3>
        {computed.trendSeries.length ? (
          <>
            <LineChartMulti series={computed.trendSeries} labels={computed.bucketLabels} />
            <ChartLegend items={computed.trendSeries.map((s) => ({ name: s.name, color: s.color }))} />
          </>
        ) : (
          <p className="text-[12.5px] text-[#898781]">No data.</p>
        )}
      </div>

      <h3 className="text-[14.5px] font-semibold mb-2.5 mt-5">Automatic monthly breakdown</h3>
      {computed.monthly.length ? (
        computed.monthly.map((m) => (
          <div key={m.month} className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4 mb-2.5">
            <div className="flex justify-between items-baseline">
              <h4 className="text-[13.5px] font-semibold">{monthLabel(m.month)}</h4>
              <span className="tabular-nums font-semibold text-[13px]">{fmtHours(m.total)} h</span>
            </div>
            <ChartLegend items={m.entries.map((e) => ({ name: `${e.name} · ${fmtHours(e.hours)}h`, color: e.color }))} />
          </div>
        ))
      ) : (
        <p className="text-[12.5px] text-[#898781]">No entries in range.</p>
      )}
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
