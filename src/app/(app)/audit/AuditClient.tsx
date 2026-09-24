"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Agent, AuditLogRow, Project } from "@/lib/types";

export default function AuditClient({
  rows,
  total,
  page,
  pageSize,
  agents,
  projects,
  agentFilter,
  projectFilter,
}: {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  agents: Agent[];
  projects: Project[];
  agentFilter: string;
  projectFilter: string;
}) {
  const router = useRouter();
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setParam(key: string, value: string) {
    const sp = new URLSearchParams({ agent: agentFilter, project: projectFilter, page: "0" });
    sp.set(key, value);
    router.push(`/audit?${sp.toString()}`);
  }
  function goPage(p: number) {
    const sp = new URLSearchParams({ agent: agentFilter, project: projectFilter, page: String(p) });
    router.push(`/audit?${sp.toString()}`);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-[19px] font-semibold">Audit log</h2>
        <span className="text-[12px] text-[#898781]">
          Page {page + 1} of {pageCount} · {total} total
        </span>
      </div>

      <div className="flex items-end gap-2.5 flex-wrap bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-3 mb-4">
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

      <div className="border border-[#e1e0d9] rounded-lg overflow-auto max-h-[65vh]">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="sticky top-0 bg-[#f3f2ee]">
            <tr>
              {["When", "Actor", "Agent", "Project", "Field", "Old value", "New value"].map((h) => (
                <th key={h} className="text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] border-b border-[#c3c2b7]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#e1e0d9] hover:bg-[#f3f2ee]">
                <td className="px-2.5 py-1.5 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                <td className="px-2.5 py-1.5">{r.actor_id ? agentById.get(r.actor_id)?.name ?? r.actor_id : "—"}</td>
                <td className="px-2.5 py-1.5">{r.agent_id ? agentById.get(r.agent_id)?.name ?? r.agent_id : "—"}</td>
                <td className="px-2.5 py-1.5">{r.project_id ? projectById.get(r.project_id)?.name ?? r.project_id : "—"}</td>
                <td className="px-2.5 py-1.5">{r.field}</td>
                <td className="px-2.5 py-1.5 text-[#898781]">{r.old_value ?? ""}</td>
                <td className="px-2.5 py-1.5">{r.new_value ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-6 text-center text-[#898781]">
                  No audit entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px] disabled:opacity-50"
          disabled={page <= 0}
          onClick={() => goPage(page - 1)}
        >
          ← Prev
        </button>
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px] disabled:opacity-50"
          disabled={page >= pageCount - 1}
          onClick={() => goPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
