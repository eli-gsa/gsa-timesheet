"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/types";
import { setAgentActive, updateAgentRole, updateAgentViewWindow } from "@/lib/actions/agents";

export default function TeamTable({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingWindow, setEditingWindow] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="border-b border-[#c3c2b7]">
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Name</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Email</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Role</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Timesheet window</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Status</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-b border-[#e1e0d9] hover:bg-[#f3f2ee]">
              <td className="px-3 py-2">{a.name}</td>
              <td className="px-3 py-2 text-[#52514e]">{a.email}</td>
              <td className="px-3 py-2">
                <select
                  className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12.5px]"
                  defaultValue={a.role}
                  disabled={isPending}
                  onChange={(e) =>
                    startTransition(async () => {
                      await updateAgentRole(a.id, e.target.value as "admin" | "agent");
                      refresh();
                    })
                  }
                >
                  <option value="agent">agent</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="px-3 py-2">
                {editingWindow === a.id ? (
                  <WindowEditor
                    agent={a}
                    onDone={() => {
                      setEditingWindow(null);
                      refresh();
                    }}
                  />
                ) : (
                  <button
                    className="text-[#2a78d6] underline text-[12px]"
                    onClick={() => setEditingWindow(a.id)}
                  >
                    {slotToTime(a.view_start_slot)}–{slotToTime(a.view_end_slot)}
                  </button>
                )}
              </td>
              <td className="px-3 py-2">
                <button
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    a.active ? "bg-[#e8f0fb] text-[#2a78d6]" : "bg-[#ececE6] text-[#898781]"
                  }`}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await setAgentActive(a.id, !a.active);
                      refresh();
                    })
                  }
                >
                  {a.active ? "Active" : "Archived"}
                </button>
              </td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-[#898781]">
                No one has signed in yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function slotToTime(slot: number) {
  const h = Math.floor(slot / 2);
  const min = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function WindowEditor({ agent, onDone }: { agent: Agent; onDone: () => void }) {
  const [start, setStart] = useState(agent.view_start_slot);
  const [end, setEnd] = useState(agent.view_end_slot);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={47}
        value={start}
        onChange={(e) => setStart(Number(e.target.value))}
        className="w-14 rounded border border-[#c3c2b7] px-1 py-0.5 text-[12px]"
      />
      <span>–</span>
      <input
        type="number"
        min={1}
        max={48}
        value={end}
        onChange={(e) => setEnd(Number(e.target.value))}
        className="w-14 rounded border border-[#c3c2b7] px-1 py-0.5 text-[12px]"
      />
      <button
        className="text-[#2a78d6] text-[12px] font-semibold"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await updateAgentViewWindow(agent.id, start, end);
            onDone();
          })
        }
      >
        Save
      </button>
      <button className="text-[#898781] text-[12px]" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}
