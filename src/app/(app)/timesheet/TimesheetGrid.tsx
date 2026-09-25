"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Lead, LeadType, Project, TimesheetEntry } from "@/lib/types";
import { contrastText, fmtHours, slotRangeLabel, slotTime } from "@/lib/types";
import { assignSlots, clearSlots, getAgentMonthTotals } from "@/lib/actions/timesheet";
import { addLead, deleteLead, updateLead } from "@/lib/actions/leads";
import { updateAgentViewWindow } from "@/lib/actions/agents";
import Modal, { ModalButton } from "@/components/Modal";

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function weekday(y: number, m: number, d: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y, m - 1, d).getDay()];
}

export default function TimesheetGrid({
  me,
  viewing,
  agents,
  month,
  projects,
  entries,
  leads,
  leadTypes,
}: {
  me: Agent;
  viewing: Agent;
  agents: Agent[];
  month: string;
  projects: Project[];
  entries: TimesheetEntry[];
  leads: Lead[];
  leadTypes: LeadType[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [leadsProject, setLeadsProject] = useState<Project | null>(null);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [windowEditorOpen, setWindowEditorOpen] = useState(false);
  const dragRef = useRef<{ mode: "select" | "deselect" } | null>(null);

  const isAdminViewingOther = me.role === "admin" && viewing.id !== me.id;
  const canEdit = me.id === viewing.id || me.role === "admin";

  const [y, m] = month.split("-").map(Number);
  const nDays = daysInMonth(y, m);
  const startSlot = viewing.view_start_slot ?? 0;
  const endSlot = viewing.view_end_slot ?? 48;
  const slots = useMemo(() => {
    const arr: number[] = [];
    for (let s = startSlot; s < endSlot; s++) arr.push(s);
    return arr;
  }, [startSlot, endSlot]);

  const entryMap = useMemo(() => {
    const map = new Map<string, TimesheetEntry>();
    for (const e of entries) map.set(`${e.entry_date}|${e.slot}`, e);
    return map;
  }, [entries]);

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const totalHours = entries.length * 0.5;

  function navMonth(delta: number) {
    const next = delta === 0 ? currentYm() : addMonths(month, delta);
    setSelection(new Set());
    pushParams({ month: next });
  }
  function currentYm() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }
  function pushParams(extra: Record<string, string>) {
    const sp = new URLSearchParams();
    sp.set("month", extra.month ?? month);
    if (me.role === "admin") sp.set("agent", extra.agent ?? viewing.id);
    router.push(`/timesheet?${sp.toString()}`);
  }

  function cellKey(date: string, slot: number) {
    return `${date}|${slot}`;
  }

  function toggleCell(date: string, slot: number, forceMode?: "select" | "deselect") {
    setSelection((prev) => {
      const next = new Set(prev);
      const key = cellKey(date, slot);
      const mode = forceMode ?? (next.has(key) ? "deselect" : "select");
      if (mode === "select") next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function onCellMouseDown(date: string, slot: number) {
    if (!canEdit) return;
    const key = cellKey(date, slot);
    const mode = selection.has(key) ? "deselect" : "select";
    dragRef.current = { mode };
    toggleCell(date, slot, mode);
  }
  function onCellMouseEnter(date: string, slot: number) {
    if (!canEdit || !dragRef.current) return;
    toggleCell(date, slot, dragRef.current.mode);
  }
  function endDrag() {
    dragRef.current = null;
  }

  function selectedCells() {
    return Array.from(selection).map((k) => {
      const [date, slot] = k.split("|");
      return { date, slot: Number(slot) };
    });
  }

  function handleAssign(projectId: string) {
    const cells = selectedCells();
    startTransition(async () => {
      await assignSlots(viewing.id, cells, projectId);
      setSelection(new Set());
      setAssignOpen(false);
      router.refresh();
    });
  }
  function handleClear() {
    const cells = selectedCells();
    startTransition(async () => {
      await clearSlots(viewing.id, cells);
      setSelection(new Set());
      router.refresh();
    });
  }

  return (
    <div onMouseUp={endDrag} onMouseLeave={endDrag}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[19px] font-semibold">
            {isAdminViewingOther ? `${viewing.name}’s timesheet` : "My timesheet"}
          </h2>
          <p className="text-[12.5px] text-[#898781]">
            {monthLabel(month)} · <span className="tabular-nums">{fmtHours(totalHours)}h</span> logged
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {me.role === "admin" && (
            <select
              className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1.5 text-[13px]"
              value={viewing.id}
              onChange={(e) => {
                setSelection(new Set());
                pushParams({ agent: e.target.value });
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]" onClick={() => navMonth(-1)}>
            ←
          </button>
          <button className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]" onClick={() => navMonth(0)}>
            Today
          </button>
          <button className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]" onClick={() => navMonth(1)}>
            →
          </button>
          {canEdit && (
            <button
              className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]"
              onClick={() => setWindowEditorOpen(true)}
            >
              View window: {slotTime(startSlot)}–{slotTime(endSlot)}
            </button>
          )}
        </div>
      </div>

      {selection.size > 0 && canEdit && (
        <div className="flex items-center gap-2.5 flex-wrap bg-[#e8f0fb] border border-[#2a78d6] rounded-lg px-3 py-2 mb-2.5 text-[12.5px]">
          <span>{selection.size} slot(s) selected</span>
          <div className="relative">
            <button
              className="rounded-md bg-[#2a78d6] text-white px-2.5 py-1 text-[12.5px] font-semibold"
              onClick={() => setAssignOpen((v) => !v)}
              disabled={isPending}
            >
              Assign project ▾
            </button>
            {assignOpen && (
              <div className="absolute z-10 mt-1 bg-white border border-[#c3c2b7] rounded-lg p-1.5 min-w-[200px] shadow-lg">
                {projects.length === 0 && (
                  <p className="text-[12px] text-[#898781] px-2 py-1.5">
                    No projects assigned to this agent yet.
                  </p>
                )}
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-[#f3f2ee] text-[13px]"
                    onClick={() => handleAssign(p.id)}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1 text-[12.5px]"
            onClick={handleClear}
            disabled={isPending}
          >
            Clear
          </button>
          <button
            className="text-[12.5px] text-[#52514e] underline"
            onClick={() => setSelection(new Set())}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]"
          onClick={() => setProjectsModalOpen(true)}
          disabled={projects.length === 0}
        >
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </button>
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]"
          onClick={() => setSummaryOpen(true)}
        >
          Project Summary
        </button>
        <button
          className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]"
          onClick={() => setLeadsProject(projects[0] ?? null)}
          disabled={projects.length === 0}
        >
          Leads
        </button>
        <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-[#52514e]">
          {projects.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div className="border border-[#e1e0d9] rounded-lg overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 text-[11.5px] select-none" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-[#f3f2ee] text-left px-3 py-1.5 border-b-2 border-r-2 border-[#c3c2b7] w-[98px]">
                Day
              </th>
              {slots.map((s) => (
                <th
                  key={s}
                  className="sticky top-0 z-10 bg-[#f3f2ee] text-[9.5px] font-normal text-[#898781] text-center px-0 py-1 border-b-2 border-r border-[#e1e0d9] w-[92px]"
                >
                  {slotRangeLabel(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: nDays }, (_, i) => i + 1).map((day) => {
              const date = `${month}-${pad2(day)}`;
              const wd = weekday(y, m, day);
              const isWeekend = wd === "Sat" || wd === "Sun";
              return (
                <tr key={date} className={isWeekend ? "bg-[#f3f2ee]" : ""}>
                  <td
                    className={`sticky left-0 z-10 px-3 whitespace-nowrap border-r-2 border-[#c3c2b7] h-[22px] text-[12px] ${
                      isWeekend ? "bg-[#f3f2ee] text-[#898781]" : "bg-[#fcfcfb] text-[#52514e]"
                    }`}
                  >
                    {day} {wd}
                  </td>
                  {slots.map((s) => {
                    const key = cellKey(date, s);
                    const entry = entryMap.get(key);
                    const project = entry ? projectById.get(entry.project_id) : undefined;
                    const selected = selection.has(key);
                    return (
                      <td
                        key={s}
                        onMouseDown={() => onCellMouseDown(date, s)}
                        onMouseEnter={() => onCellMouseEnter(date, s)}
                        className={`h-[22px] w-[92px] border border-[#e1e0d9] p-0 box-border ${
                          canEdit ? "cursor-pointer" : "cursor-default"
                        }`}
                        style={{
                          background: selected
                            ? "color-mix(in srgb, #2a78d6 38%, white)"
                            : project?.color ?? undefined,
                        }}
                        title={project?.name}
                      >
                        {project && (
                          <span
                            className="block w-full h-full leading-[20px] px-1 text-[9.5px] font-medium overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none"
                            style={{ color: contrastText(project.color) }}
                          >
                            {project.name}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {leadsProject && (
        <LeadsModal
          agentId={viewing.id}
          month={month}
          project={leadsProject}
          projects={projects}
          leads={leads}
          leadTypes={leadTypes}
          canEdit={canEdit}
          onProjectChange={setLeadsProject}
          onClose={() => setLeadsProject(null)}
        />
      )}

      {projectsModalOpen && (
        <ProjectsModal
          agentName={viewing.name}
          projects={projects}
          isAdmin={me.role === "admin"}
          onClose={() => setProjectsModalOpen(false)}
        />
      )}

      {summaryOpen && (
        <ProjectSummaryModal
          agentId={viewing.id}
          agentName={viewing.name}
          initialMonth={month}
          projects={projects}
          onClose={() => setSummaryOpen(false)}
        />
      )}

      {windowEditorOpen && (
        <WindowEditorModal
          agentId={viewing.id}
          startSlot={startSlot}
          endSlot={endSlot}
          onClose={() => setWindowEditorOpen(false)}
          onSaved={() => {
            setWindowEditorOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ProjectsModal({
  agentName,
  projects,
  isAdmin,
  onClose,
}: {
  agentName: string;
  projects: Project[];
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <Modal
      title={`Projects: ${agentName}`}
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      <div className="max-h-[280px] overflow-y-auto border border-[#e1e0d9] rounded-lg p-1">
        {projects.length ? (
          projects.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-[12.5px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              {isAdmin ? (
                <button
                  className="text-[#2a78d6] hover:underline"
                  onClick={() => {
                    onClose();
                    router.push(`/projects?highlight=${p.id}`);
                  }}
                >
                  {p.name}
                </button>
              ) : (
                <span>{p.name}</span>
              )}
            </div>
          ))
        ) : (
          <p className="text-[12.5px] text-[#898781] px-2 py-2">No projects assigned yet.</p>
        )}
      </div>
    </Modal>
  );
}

function ProjectSummaryModal({
  agentId,
  agentName,
  initialMonth,
  projects,
  onClose,
}: {
  agentId: string;
  agentName: string;
  initialMonth: string;
  projects: Project[];
  onClose: () => void;
}) {
  const [ym, setYm] = useState(initialMonth);
  const [totals, setTotals] = useState<Record<string, number> | null>(null);
  const [standardDayHours, setStandardDayHours] = useState(7);
  const [isPending, startTransition] = useTransition();

  function load(nextYm: string) {
    startTransition(async () => {
      const res = await getAgentMonthTotals(agentId, nextYm);
      setTotals(res.totals);
      setStandardDayHours(res.standardDayHours);
    });
  }
  // Load on first render.
  useMemo(() => load(ym), []); // eslint-disable-line react-hooks/exhaustive-deps

  function nav(delta: number) {
    const next = delta === 0 ? currentYm() : addMonths(ym, delta);
    setYm(next);
    load(next);
  }
  function currentYm() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  const rows = projects.map((p) => {
    const hh = totals?.[p.id] ?? 0;
    const hrs = hh * 0.5;
    return { project: p, hh, hrs, days: hrs / standardDayHours };
  });
  const totHH = rows.reduce((a, r) => a + r.hh, 0);

  return (
    <Modal
      title={`Project Summary: ${agentName}`}
      onClose={onClose}
      maxWidth={560}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      <div className="flex items-center gap-2 mb-3">
        <button className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12.5px]" onClick={() => nav(-1)}>
          ←
        </button>
        <strong className="min-w-[140px] text-center inline-block text-[13px]">{monthLabel(ym)}</strong>
        <button className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12.5px]" onClick={() => nav(1)}>
          →
        </button>
        <button className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] text-[#898781]" onClick={() => nav(0)}>
          Today
        </button>
      </div>
      {isPending && !totals ? (
        <p className="text-[12.5px] text-[#898781]">Loading…</p>
      ) : (
        <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
          <table className="w-full text-[12.5px] border-collapse">
            <thead className="bg-[#f3f2ee]">
              <tr>
                <th className="text-left px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Project</th>
                <th className="text-right px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">1/2 hrs</th>
                <th className="text-right px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Hours</th>
                <th className="text-right px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">
                  Days (÷{standardDayHours}h)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project.id} className="border-t border-[#e1e0d9]">
                  <td className="px-2.5 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: r.project.color }} />
                      {r.project.name}
                    </span>
                  </td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{r.hh}</td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(r.hrs)}</td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(r.days)}</td>
                </tr>
              ))}
              <tr className="border-t border-[#e1e0d9] bg-[#f3f2ee]">
                <td className="px-2.5 py-1 font-semibold">Total</td>
                <td className="px-2.5 py-1 text-right tabular-nums font-semibold">{totHH}</td>
                <td className="px-2.5 py-1 text-right tabular-nums font-semibold">{fmtHours(totHH * 0.5)}</td>
                <td className="px-2.5 py-1 text-right tabular-nums font-semibold">
                  {fmtHours((totHH * 0.5) / standardDayHours)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function WindowEditorModal({
  agentId,
  startSlot,
  endSlot,
  onClose,
  onSaved,
}: {
  agentId: string;
  startSlot: number;
  endSlot: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(startSlot);
  const [end, setEnd] = useState(endSlot);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function slotOptions() {
    const opts: { value: number; label: string }[] = [];
    for (let s = 0; s <= 48; s++) opts.push({ value: s, label: s === 48 ? "24:00" : slotTime(s) });
    return opts;
  }
  const options = slotOptions();

  function save() {
    if (end <= start) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await updateAgentViewWindow(agentId, start, end);
      onSaved();
    });
  }

  return (
    <Modal
      title="Edit hours shown"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton
            variant="subtle"
            onClick={() => {
              setStart(0);
              setEnd(48);
            }}
          >
            Show full 24 hours
          </ModalButton>
          <ModalButton variant="primary" onClick={save} disabled={isPending}>
            Save
          </ModalButton>
        </>
      }
    >
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Show from
          <select
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          >
            {options
              .filter((o) => o.value < 48)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
          Show until
          <select
            className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          >
            {options
              .filter((o) => o.value > 0)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <p className="text-[12px] text-[#d03b3b] mt-2">{error}</p>}
    </Modal>
  );
}

function LeadsModal({
  agentId,
  month,
  project,
  projects,
  leads,
  leadTypes,
  canEdit,
  onProjectChange,
  onClose,
}: {
  agentId: string;
  month: string;
  project: Project;
  projects: Project[];
  leads: Lead[];
  leadTypes: LeadType[];
  canEdit: boolean;
  onProjectChange: (p: Project) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState(leadTypes[0]?.name ?? "");
  const projectLeads = leads.filter((l) => l.project_id === project.id);

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await addLead(agentId, project.id, month, newName.trim(), newType);
      setNewName("");
      router.refresh();
    });
  }
  function handleUpdate(leadId: string, name: string, type: string) {
    startTransition(async () => {
      await updateLead(leadId, name, type);
      router.refresh();
    });
  }
  function handleDelete(leadId: string) {
    startTransition(async () => {
      await deleteLead(leadId);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/35 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose}>
      <div
        className="relative bg-[#fcfcfb] border border-[#c3c2b7] rounded-xl p-4.5 max-w-[440px] w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="absolute top-2.5 right-2.5 w-7 h-7 text-[#898781]" onClick={onClose}>
          ×
        </button>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: project.color }} />
          <select
            className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[13px] font-semibold"
            value={project.id}
            onChange={(e) => {
              const p = projects.find((x) => x.id === e.target.value);
              if (p) onProjectChange(p);
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-[#898781]">leads</span>
        </div>

        <div className="flex flex-col gap-1 mb-3">
          {projectLeads.length === 0 && (
            <p className="text-[12.5px] text-[#898781]">No leads logged for this project this month yet.</p>
          )}
          {projectLeads.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5 border border-[#e1e0d9] rounded-md px-2 py-1">
              <input
                className="flex-1 border-none bg-transparent text-[13px] focus:outline-none"
                defaultValue={l.name}
                disabled={!canEdit}
                onBlur={(e) => e.target.value !== l.name && handleUpdate(l.id, e.target.value, l.type)}
              />
              <select
                className="border-none bg-transparent text-[12px] text-[#898781]"
                defaultValue={l.type}
                disabled={!canEdit}
                onChange={(e) => handleUpdate(l.id, l.name, e.target.value)}
              >
                {leadTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              {canEdit && (
                <button className="text-[#d03b3b] text-[12px] px-1" onClick={() => handleDelete(l.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="flex gap-1.5 flex-wrap items-end border-t border-[#e1e0d9] pt-3">
            <label className="flex flex-col gap-1 text-[12px] text-[#52514e] flex-1 min-w-[140px]">
              Name
              <input
                className="rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Lead name"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
              Type
              <select
                className="rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {leadTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
              onClick={handleAdd}
              disabled={isPending}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
