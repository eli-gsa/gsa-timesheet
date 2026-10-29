"use client";

import { useMemo, useState } from "react";
import type { Agent } from "@/lib/types";
import { fmtHours } from "@/lib/types";
import Modal, { ModalButton } from "@/components/Modal";
import { useBusyTransition } from "@/components/BusyOverlay";
import { figures, windowLabel, type AllocStatus } from "@/lib/allocation";
import { bulkAllocate } from "@/lib/actions/allocations";

const input = "rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[13px]";
const th = "text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium whitespace-nowrap";

function num(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One row per assigned agent: campaign hours left, counting window, weekly and
// monthly caps. Tick rows to give several agents hours at once; Manage… opens
// the full per-agent manager.
export default function AllocationTable({
  projectId,
  agents,
  allocStatus,
  onManage,
  onChanged,
}: {
  projectId: string;
  agents: Agent[];
  allocStatus: AllocStatus[];
  onManage: (agent: Agent) => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(
    () =>
      agents.map((a) => {
        const mine = allocStatus.filter((x) => x.agentId === a.id);
        return {
          agent: a,
          campaign: mine.find((x) => x.kind === "campaign") ?? null,
          weekly: mine.find((x) => x.kind === "weekly") ?? null,
          monthly: mine.find((x) => x.kind === "monthly") ?? null,
        };
      }),
    [agents, allocStatus]
  );

  // Selection survives refreshes, but only for agents still in the table.
  const sel = useMemo(() => new Set(Array.from(selected).filter((id) => agents.some((a) => a.id === id))), [selected, agents]);
  const allSelected = rows.length > 0 && sel.size === rows.length;

  const cap = (a: AllocStatus | null, unit: string) => {
    if (!a) return <span className="text-[#c3c2b7]">—</span>;
    const f = figures(a);
    return (
      <span className={`tabular-nums ${f.tone === "over" ? "text-[#d03b3b]" : f.tone === "low" ? "text-[#b87400]" : ""}`}>
        {fmtHours(f.logged)} / {fmtHours(f.total)}h<span className="text-[#898781]"> {unit}</span>
      </span>
    );
  };

  return (
    <div>
      {sel.size > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap bg-[#e8f0fb] border border-[#2a78d6] rounded-lg px-3 py-1.5 mb-2 text-[12.5px]">
          <span>{sel.size} selected</span>
          <button
            className="rounded-md bg-[#2a78d6] text-white px-2.5 py-1 text-[12.5px] font-semibold"
            onClick={() => setBulkOpen(true)}
          >
            Add hours…
          </button>
          <button className="text-[#52514e] underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className="border border-[#e1e0d9] rounded-lg bg-white overflow-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="bg-[#f3f2ee]">
            <tr>
              <th className="px-2.5 py-1.5 w-[32px]">
                <input
                  type="checkbox"
                  aria-label="Select all agents"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.agent.id)) : new Set())}
                />
              </th>
              <th className={th}>Agent</th>
              <th className={th}>Campaign hours</th>
              <th className={th}>Counting</th>
              <th className={th}>Weekly (used / cap)</th>
              <th className={th}>Monthly (used / cap)</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agent, campaign, weekly, monthly }) => {
              const f = campaign ? figures(campaign) : null;
              const checked = sel.has(agent.id);
              return (
                <tr
                  key={agent.id}
                  className={`border-t border-[#e1e0d9] cursor-pointer ${checked ? "bg-[#f1f6fd]" : "hover:bg-[#f9f9f7]"}`}
                  onClick={() =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(agent.id)) n.delete(agent.id);
                      else n.add(agent.id);
                      return n;
                    })
                  }
                >
                  <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${agent.name}`}
                      checked={checked}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(agent.id);
                          else n.delete(agent.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{agent.name}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    {f && campaign ? (
                      <span
                        className={`tabular-nums ${
                          f.tone === "over" ? "text-[#d03b3b]" : f.tone === "low" ? "text-[#b87400]" : ""
                        }`}
                      >
                        {f.left < 0 ? `${fmtHours(-f.left)}h over` : `${fmtHours(f.left)}h left`}
                        <span className="text-[#898781]"> of {fmtHours(f.total)}h</span>
                      </span>
                    ) : (
                      <span className="text-[#898781]">none</span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-[#52514e]">
                    {campaign ? windowLabel(campaign) : <span className="text-[#c3c2b7]">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{cap(weekly, "/wk")}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{cap(monthly, "/mo")}</td>
                  <td className="px-2.5 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] hover:bg-[#f3f2ee]"
                      onClick={() => onManage(agent)}
                    >
                      Manage…
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {bulkOpen && (
        <BulkModal
          projectId={projectId}
          agents={agents.filter((a) => sel.has(a.id))}
          hasOpen={new Set(allocStatus.filter((a) => a.kind === "campaign").map((a) => a.agentId))}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function BulkModal({
  projectId,
  agents,
  hasOpen,
  onClose,
  onDone,
}: {
  projectId: string;
  agents: Agent[];
  hasOpen: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = localToday();
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useBusyTransition();

  const h = num(hours);
  const topUps = agents.filter((a) => hasOpen.has(a.id)).length;
  const fresh = agents.length - topUps;

  function apply() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await bulkAllocate(projectId, agents.map((a) => a.id), h as number, date, start || null, end || null, note);
        if (res.failed.length > 0) {
          const names = res.failed.map((f) => agents.find((a) => a.id === f.agentId)?.name ?? f.agentId).join(", ");
          setError(`Done for ${res.created + res.toppedUp}; failed for ${names}: ${res.failed[0].message}`);
          return;
        }
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <Modal
      title={`Add hours: ${agents.length} agent${agents.length === 1 ? "" : "s"}`}
      subtitle={agents.map((a) => a.name).join(", ")}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={apply}>
            Apply
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e] w-[160px]">
          Hours each (− to reduce)
          <input
            className={`${input} tabular-nums`}
            inputMode="decimal"
            placeholder="150"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            autoFocus
          />
        </label>
        <p className="text-[12px] text-[#52514e]">
          {fresh > 0 && (
            <>
              <strong>{fresh}</strong> without an open campaign allocation will get a new one with these hours.{" "}
            </>
          )}
          {topUps > 0 && (
            <>
              <strong>{topUps}</strong> with one will be topped up by this amount.
            </>
          )}
        </p>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
            Top-up date
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {fresh > 0 && (
            <>
              <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
                New: counting from
                <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
                New: until (optional)
                <input type="date" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Note
          <input className={input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        {(h === null || h === 0) && hours.trim() !== "" && (
          <p className="text-[12px] text-[#d03b3b]">Enter a non-zero number of hours.</p>
        )}
        {error && <p className="text-[12.5px] text-[#d03b3b]">{error}</p>}
        {isPending && <p className="text-[12px] text-[#898781]">Applying…</p>}
      </div>
    </Modal>
  );
}
