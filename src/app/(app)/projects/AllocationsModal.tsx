"use client";

import { useEffect, useState } from "react";
import Modal, { ModalButton } from "@/components/Modal";
import { useBusyTransition } from "@/components/BusyOverlay";
import { fmtHours } from "@/lib/types";
import { addDaysIso, figures, paceInfo, windowLabel, type AllocStatus } from "@/lib/allocation";
import {
  addAllocationEntry,
  closeAllocation,
  createAllocation,
  getAllocationDetail,
  removeAllocationEntry,
  setRecurringCap,
  updateAllocationWindow,
  type AllocationDetail,
} from "@/lib/actions/allocations";

const input = "rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[13px]";
const smallBtn =
  "rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] hover:bg-[#f3f2ee] disabled:opacity-50 disabled:cursor-not-allowed";
const primaryBtn =
  "rounded-md bg-[#2a78d6] text-white px-2.5 py-1 text-[12.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed";

function num(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Admin manager for one agent's allocations on one project: the campaign
// allocation (top-up ledger, counting window, close/renew), weekly/monthly
// caps, and past allocations.
export default function AllocationsModal({
  projectId,
  projectName,
  agentId,
  agentName,
  onClose,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useBusyTransition();
  const [detail, setDetail] = useState<AllocationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    startTransition(async () => {
      try {
        setDetail(await getAllocationDetail(projectId, agentId));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load allocations.");
      }
    });
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run a mutation, then reload this modal and the page behind it.
  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setDetail(await getAllocationDetail(projectId, agentId));
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const open = detail?.allocations.filter((a) => !a.closedAt) ?? [];
  const campaign = open.find((a) => a.kind === "campaign") ?? null;
  const weekly = open.find((a) => a.kind === "weekly") ?? null;
  const monthly = open.find((a) => a.kind === "monthly") ?? null;
  const past = detail?.allocations.filter((a) => a.closedAt && a.kind === "campaign") ?? [];

  return (
    <Modal
      title={`Allocations: ${agentName}`}
      subtitle={projectName}
      onClose={onClose}
      maxWidth={640}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      {error && <p className="text-[12.5px] text-[#d03b3b] mb-2">{error}</p>}
      {!detail ? (
        <p className="text-[12.5px] text-[#898781]">{isPending ? "Loading…" : "Nothing to show."}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {campaign ? (
            <CampaignCard a={campaign} detail={detail} disabled={isPending} run={run} />
          ) : (
            <NewCampaign today={detail.today} disabled={isPending} run={run} projectId={projectId} agentId={agentId} />
          )}

          <section>
            <h4 className="text-[12.5px] font-semibold mb-0.5">Recurring caps</h4>
            <p className="text-[11.5px] text-[#898781] mb-1.5">
              A limit that resets by itself (weeks run Mon–Sun, months are calendar months). Leave blank for none.
            </p>
            <div className="flex flex-col gap-1.5">
              <CapRow label="Weekly" a={weekly} disabled={isPending} onSave={(h) => run(() => setRecurringCap(projectId, agentId, "weekly", h))} />
              <CapRow label="Monthly" a={monthly} disabled={isPending} onSave={(h) => run(() => setRecurringCap(projectId, agentId, "monthly", h))} />
            </div>
          </section>

          {past.length > 0 && (
            <section>
              <h4 className="text-[12.5px] font-semibold mb-1.5">Past allocations</h4>
              <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-[#f3f2ee]">
                    <tr>
                      <th className="text-left px-2.5 py-1 text-[11px] uppercase text-[#898781] font-medium">Window</th>
                      <th className="text-right px-2.5 py-1 text-[11px] uppercase text-[#898781] font-medium">Allocated</th>
                      <th className="text-right px-2.5 py-1 text-[11px] uppercase text-[#898781] font-medium">Logged</th>
                      <th className="text-right px-2.5 py-1 text-[11px] uppercase text-[#898781] font-medium">Unused</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((a) => {
                      const f = figures(a);
                      return (
                        <tr key={a.allocationId} className="border-t border-[#e1e0d9]">
                          <td className="px-2.5 py-1">{windowLabel(a)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(f.total)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(f.logged)}</td>
                          <td className={`px-2.5 py-1 text-right tabular-nums ${f.left < 0 ? "text-[#d03b3b]" : ""}`}>
                            {f.left < 0 ? `${fmtHours(-f.left)} over` : fmtHours(f.left)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

type RunFn = (fn: () => Promise<void>) => void;

function CampaignCard({
  a,
  detail,
  disabled,
  run,
}: {
  a: AllocStatus;
  detail: AllocationDetail;
  disabled: boolean;
  run: RunFn;
}) {
  const f = figures(a);
  const pace = paceInfo(a, detail.today);
  const entries = detail.entries.filter((e) => e.allocationId === a.allocationId);

  const [start, setStart] = useState(a.startDate ?? "");
  const [end, setEnd] = useState(a.endDate ?? "");
  const windowDirty = start !== (a.startDate ?? "") || end !== (a.endDate ?? "");

  const [topHours, setTopHours] = useState("");
  const [topDate, setTopDate] = useState(detail.today);
  const [topNote, setTopNote] = useState("");
  const topParsed = num(topHours);

  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(detail.today);
  const [renew, setRenew] = useState(false);
  const [carry, setCarry] = useState(true);
  const [renewHours, setRenewHours] = useState("");
  const [renewEnd, setRenewEnd] = useState("");
  const carryAmount = Math.max(0, f.left);
  const renewTotal = (carry ? carryAmount : 0) + (num(renewHours) ?? 0);

  return (
    <section className="border border-[#e1e0d9] rounded-lg p-3 bg-white">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h4 className="text-[13px] font-semibold">Campaign allocation</h4>
        <span
          className={`text-[13px] tabular-nums font-semibold ${
            f.tone === "over" ? "text-[#d03b3b]" : f.tone === "low" ? "text-[#b87400]" : ""
          }`}
        >
          {f.left < 0 ? `${fmtHours(-f.left)}h over` : `${fmtHours(f.left)}h left`}
        </span>
      </div>
      <p className="text-[12px] text-[#52514e] tabular-nums">
        {fmtHours(f.logged)} logged of {fmtHours(f.total)}h · counting {windowLabel(a)}
      </p>
      {pace && !pace.ended && !pace.notStarted && (
        <p className="text-[11.5px] text-[#898781] tabular-nums">
          Needs {fmtHours(Math.round((pace.requiredPerDay ?? 0) * 10) / 10)}h/day for {pace.daysLeft} working day
          {pace.daysLeft === 1 ? "" : "s"}
          {pace.avgPerDay !== null && ` · averaging ${fmtHours(Math.round(pace.avgPerDay * 10) / 10)}h/day`}
          {pace.onTrack !== null && (pace.onTrack ? " · on track" : " · behind")}
        </p>
      )}
      {pace?.ended && (
        <p className="text-[11.5px] text-[#b87400]">Ended with {fmtHours(pace.remainingH)}h unused.</p>
      )}

      {/* Counting window */}
      <div className="flex items-end gap-2 flex-wrap mt-3">
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Counting from
          <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Until (optional)
          <input type="date" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        {windowDirty && (
          <button
            className={primaryBtn}
            disabled={disabled}
            onClick={() => run(() => updateAllocationWindow(a.allocationId, start || null, end || null))}
          >
            Save window
          </button>
        )}
      </div>

      {/* Top-up ledger */}
      <div className="mt-3">
        <h5 className="text-[12px] font-semibold mb-1">Top-ups</h5>
        <div className="flex items-end gap-2 flex-wrap mb-2">
          <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
            Hours (use − to reduce)
            <input
              className={`${input} w-[110px] tabular-nums`}
              inputMode="decimal"
              placeholder="+50"
              value={topHours}
              onChange={(e) => setTopHours(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
            Date
            <input type="date" className={input} value={topDate} onChange={(e) => setTopDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e] flex-1 min-w-[120px]">
            Note
            <input className={input} value={topNote} maxLength={200} onChange={(e) => setTopNote(e.target.value)} />
          </label>
          <button
            className={primaryBtn}
            disabled={disabled || topParsed === null || topParsed === 0 || !topDate}
            onClick={() =>
              run(async () => {
                await addAllocationEntry(a.allocationId, topParsed as number, topDate, topNote);
                setTopHours("");
                setTopNote("");
              })
            }
          >
            Add
          </button>
        </div>
        <div className="border border-[#e1e0d9] rounded-lg overflow-hidden max-h-[180px] overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-[12px] text-[#898781] px-2.5 py-2">No entries yet.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-2.5 py-1 text-[12px] border-b border-[#e1e0d9] last:border-b-0">
                <span className="text-[#898781] tabular-nums w-[78px] shrink-0">{e.entryDate}</span>
                <span className={`tabular-nums w-[64px] shrink-0 font-semibold ${e.hours < 0 ? "text-[#d03b3b]" : ""}`}>
                  {e.hours > 0 ? "+" : ""}
                  {fmtHours(e.hours)}h
                </span>
                <span className="flex-1 text-[#52514e] truncate">{e.note}</span>
                <button
                  className="text-[#d03b3b] text-[11.5px]"
                  disabled={disabled}
                  onClick={() => run(() => removeAllocationEntry(e.id))}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Close / renew */}
      <div className="mt-3">
        {!closing ? (
          <button className={smallBtn} onClick={() => setClosing(true)}>
            Close allocation…
          </button>
        ) : (
          <div className="border border-[#e1e0d9] rounded-lg p-2.5 bg-[#f9f9f7] flex flex-col gap-2">
            <p className="text-[12px] text-[#52514e]">
              Closing keeps this allocation as a record and stops it counting. {fmtHours(f.left)}h
              {f.left < 0 ? " over" : " unused"} at close.
            </p>
            <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e] w-[160px]">
              Closed on
              <input type="date" className={input} value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
              Start a new allocation
            </label>
            {renew && (
              <div className="flex flex-col gap-2 pl-5">
                {carryAmount > 0 && (
                  <label className="flex items-center gap-1.5 text-[12.5px]">
                    <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
                    Carry over the {fmtHours(carryAmount)}h unused
                  </label>
                )}
                <div className="flex items-end gap-2 flex-wrap">
                  <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
                    Additional hours
                    <input
                      className={`${input} w-[110px] tabular-nums`}
                      inputMode="decimal"
                      placeholder="0"
                      value={renewHours}
                      onChange={(e) => setRenewHours(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
                    Until (optional)
                    <input type="date" className={input} value={renewEnd} onChange={(e) => setRenewEnd(e.target.value)} />
                  </label>
                </div>
                <p className="text-[11.5px] text-[#898781]">
                  New allocation: {fmtHours(renewTotal)}h, counting from {addDaysIso(closeDate || detail.today, 1)}.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                className={primaryBtn}
                disabled={disabled || !closeDate || (renew && (num(renewHours) === null && renewHours.trim() !== ""))}
                onClick={() =>
                  run(async () => {
                    await closeAllocation(
                      a.allocationId,
                      closeDate,
                      renew
                        ? {
                            hours: renewTotal,
                            startDate: addDaysIso(closeDate, 1),
                            endDate: renewEnd || null,
                            note: carry && carryAmount > 0 ? `Renewed; ${fmtHours(carryAmount)}h carried over` : "Renewed",
                          }
                        : null
                    );
                    setClosing(false);
                  })
                }
              >
                {renew ? "Close and start new" : "Close allocation"}
              </button>
              <button className={smallBtn} onClick={() => setClosing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function NewCampaign({
  today,
  disabled,
  run,
  projectId,
  agentId,
}: {
  today: string;
  disabled: boolean;
  run: RunFn;
  projectId: string;
  agentId: string;
}) {
  const [hours, setHours] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const h = num(hours);
  return (
    <section className="border border-[#e1e0d9] rounded-lg p-3 bg-white">
      <h4 className="text-[13px] font-semibold mb-0.5">No open campaign allocation</h4>
      <p className="text-[11.5px] text-[#898781] mb-2">
        Set the hours this agent has for this project. Only hours logged from the start date (and before the end date,
        if any) count against it. Clear the start date to count every hour logged so far.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Hours
          <input className={`${input} w-[100px] tabular-nums`} inputMode="decimal" placeholder="150" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Counting from
          <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e]">
          Until (optional)
          <input type="date" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11.5px] text-[#52514e] flex-1 min-w-[120px]">
          Note
          <input className={input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button
          className={primaryBtn}
          disabled={disabled || h === null || h < 0}
          onClick={() =>
            run(() =>
              createAllocation({
                projectId,
                agentId,
                kind: "campaign",
                hours: h as number,
                startDate: start || null,
                endDate: end || null,
                note,
              })
            )
          }
        >
          Create
        </button>
      </div>
    </section>
  );
}

function CapRow({
  label,
  a,
  disabled,
  onSave,
}: {
  label: string;
  a: AllocStatus | null;
  disabled: boolean;
  onSave: (hours: number | null) => void;
}) {
  const saved = a ? a.totalHours : null;
  const [draft, setDraft] = useState(saved === null ? "" : String(saved));
  const parsed = draft.trim() === "" ? null : num(draft);
  const valid = draft.trim() === "" || (parsed !== null && parsed >= 0);
  const dirty = valid && parsed !== saved;
  const f = a ? figures(a) : null;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="w-[64px] text-[#52514e]">{label}</span>
      <input
        className={`${input} w-[90px] tabular-nums ${valid ? "" : "border-[#d03b3b]"}`}
        inputMode="decimal"
        placeholder="—"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <span className="text-[#898781]">h</span>
      {dirty && (
        <button className={primaryBtn} disabled={disabled} onClick={() => onSave(parsed)}>
          Save
        </button>
      )}
      {f && !dirty && (
        <span className="text-[11.5px] text-[#898781] tabular-nums">
          {fmtHours(f.logged)}h used {label === "Weekly" ? "this week" : "this month"} ·{" "}
          {f.left < 0 ? `${fmtHours(-f.left)}h over` : `${fmtHours(f.left)}h left`}
        </span>
      )}
    </div>
  );
}
