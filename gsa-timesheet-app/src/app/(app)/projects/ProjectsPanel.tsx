"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Project, ProjectAgent, Rate } from "@/lib/types";
import {
  addProject,
  addRate,
  deleteRate,
  setProjectActive,
  setProjectAssignment,
  updateProject,
} from "@/lib/actions/projects";

const DEFAULT_PALETTE = ["#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#2a78d6"];

export default function ProjectsPanel({
  projects,
  agents,
  assignments,
  rates,
}: {
  projects: Project[];
  agents: Agent[];
  assignments: ProjectAgent[];
  rates: Rate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PALETTE[0]);

  function refresh() {
    router.refresh();
  }

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      await addProject(name.trim(), color);
      setName("");
      setColor(DEFAULT_PALETTE[Math.floor(Math.random() * DEFAULT_PALETTE.length)]);
      setShowAdd(false);
      refresh();
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-[19px] font-semibold">Projects</h2>
        <button
          className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
          onClick={() => setShowAdd((v) => !v)}
        >
          {showAdd ? "Cancel" : "+ Add project"}
        </button>
      </div>

      {showAdd && (
        <div className="border border-[#e1e0d9] rounded-lg p-3.5 mb-4 bg-[#f3f2ee] flex items-end gap-2.5 flex-wrap">
          <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
            Name
            <input
              className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
            Color
            <input
              type="color"
              className="w-11 h-[34px] p-0.5"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <button
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
            disabled={isPending}
            onClick={handleAdd}
          >
            Create
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {projects.map((p) => (
          <div key={p.id} className="border border-[#e1e0d9] rounded-lg bg-[#fcfcfb]">
            <button
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="font-medium text-[13.5px]">{p.name}</span>
              {!p.active && (
                <span className="rounded-full bg-[#ececE6] text-[#898781] text-[11px] px-2 py-0.5">archived</span>
              )}
              <span className="ml-auto text-[#898781] text-[12px]">
                {assignments.filter((a) => a.project_id === p.id).length} agent(s)
              </span>
            </button>
            {expanded === p.id && (
              <div className="border-t border-[#e1e0d9] p-3.5">
                <ProjectDetail
                  project={p}
                  agents={agents}
                  assignments={assignments.filter((a) => a.project_id === p.id)}
                  rates={rates.filter((r) => r.project_id === p.id)}
                  onChanged={refresh}
                />
              </div>
            )}
          </div>
        ))}
        {projects.length === 0 && <p className="text-[#898781] text-[13px]">No projects yet.</p>}
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  agents,
  assignments,
  rates,
  onChanged,
}: {
  project: Project;
  agents: Agent[];
  assignments: ProjectAgent[];
  rates: Rate[];
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const assignedIds = new Set(assignments.map((a) => a.agent_id));

  const [rateAgent, setRateAgent] = useState(agents[0]?.id ?? "");
  const [rateValue, setRateValue] = useState("");
  const [rateFrom, setRateFrom] = useState(new Date().toISOString().slice(0, 10));

  function save() {
    startTransition(async () => {
      await updateProject(project.id, name, color);
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2.5 flex-wrap">
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Name
          <input
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Color
          <input
            type="color"
            className="w-11 h-[34px] p-0.5"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px]"
          disabled={isPending}
          onClick={save}
        >
          Save
        </button>
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px] ml-auto"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setProjectActive(project.id, !project.active);
              onChanged();
            })
          }
        >
          {project.active ? "Archive" : "Reactivate"}
        </button>
      </div>

      <div>
        <h4 className="text-[12.5px] font-semibold mb-1.5">Assigned agents</h4>
        <div className="flex flex-wrap gap-1.5">
          {agents.map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-1.5 border border-[#e1e0d9] rounded-full px-2.5 py-1 text-[12.5px] bg-white"
            >
              <input
                type="checkbox"
                checked={assignedIds.has(a.id)}
                disabled={isPending}
                onChange={(e) =>
                  startTransition(async () => {
                    await setProjectAssignment(project.id, a.id, e.target.checked);
                    onChanged();
                  })
                }
              />
              {a.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-[12.5px] font-semibold mb-1.5">Rates</h4>
        <table className="w-full text-[12.5px] mb-2">
          <thead>
            <tr className="text-[11px] uppercase text-[#898781] text-left">
              <th className="py-1">Agent</th>
              <th className="py-1">Rate</th>
              <th className="py-1">Effective from</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-t border-[#e1e0d9]">
                <td className="py-1">{agents.find((a) => a.id === r.agent_id)?.name ?? r.agent_id}</td>
                <td className="py-1 tabular-nums">{r.rate}</td>
                <td className="py-1">{r.effective_from}</td>
                <td className="py-1">
                  <button
                    className="text-[#d03b3b] text-[12px]"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteRate(r.id);
                        onChanged();
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-[#898781]">
                  No rates set for this project yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-end gap-2 flex-wrap">
          <select
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[12.5px]"
            value={rateAgent}
            onChange={(e) => setRateAgent(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Rate"
            className="w-24 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[12.5px]"
            value={rateValue}
            onChange={(e) => setRateValue(e.target.value)}
          />
          <input
            type="date"
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[12.5px]"
            value={rateFrom}
            onChange={(e) => setRateFrom(e.target.value)}
          />
          <button
            className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px]"
            disabled={isPending || !rateAgent || !rateValue}
            onClick={() =>
              startTransition(async () => {
                await addRate(rateAgent, project.id, Number(rateValue), rateFrom);
                setRateValue("");
                onChanged();
              })
            }
          >
            Add rate
          </button>
        </div>
      </div>
    </div>
  );
}
