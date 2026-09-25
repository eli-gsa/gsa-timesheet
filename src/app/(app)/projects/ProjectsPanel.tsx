"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Project, ProjectAgent, TimesheetEntry } from "@/lib/types";
import {
  addProject,
  deleteProject,
  setProjectActive,
  setProjectAssignment,
  updateProject,
} from "@/lib/actions/projects";
import Modal, { ListRow, ModalButton, RoleBadge } from "@/components/Modal";
import { useRowHighlight } from "@/components/useRowHighlight";

const DEFAULT_PALETTE = ["#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#2a78d6"];

export default function ProjectsPanel({
  projects,
  agents,
  assignments,
  entries,
}: {
  projects: Project[];
  agents: Agent[];
  assignments: ProjectAgent[];
  entries: Pick<TimesheetEntry, "project_id">[];
}) {
  const router = useRouter();
  useRowHighlight("data-proj-row");
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_PALETTE[0]);
  const [assignedAgentsFor, setAssignedAgentsFor] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const projectHasHours = useMemo(() => {
    const set = new Set(entries.map((e) => e.project_id));
    return (projectId: string) => set.has(projectId);
  }, [entries]);

  const list = projects.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) && p.active === (statusFilter === "active")
  );

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
        <div>
          <h2 className="text-[19px] font-semibold">Projects</h2>
          <p className="text-[12.5px] text-[#898781] mt-0.5">{projects.length} projects</p>
        </div>
        <button
          className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
          }}
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

      <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3">
        <input
          type="text"
          placeholder="Search projects…"
          className="rounded-md border border-[#c3c2b7] px-2.5 py-1.5 text-[13px] min-w-[200px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5">
          <button
            className={`rounded-md px-2.5 py-1 text-[12.5px] ${
              statusFilter === "active" ? "bg-[#2a78d6] text-white" : "border border-[#c3c2b7] bg-white"
            }`}
            onClick={() => setStatusFilter("active")}
          >
            Active
          </button>
          <button
            className={`rounded-md px-2.5 py-1 text-[12.5px] ${
              statusFilter === "archived" ? "bg-[#2a78d6] text-white" : "border border-[#c3c2b7] bg-white"
            }`}
            onClick={() => setStatusFilter("archived")}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="border-b border-[#c3c2b7] bg-[#f3f2ee]">
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Project</th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">
                Assigned agents
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const assignedAgents = agents.filter((a) =>
                assignments.some((asg) => asg.project_id === p.id && asg.agent_id === a.id)
              );
              return (
                <Fragment key={p.id}>
                  <tr
                    data-proj-row={p.id}
                    className="border-b border-[#e1e0d9] hover:bg-[#f3f2ee] cursor-pointer"
                    onClick={() => {
                      setEditingId(editingId === p.id ? null : p.id);
                      setShowAdd(false);
                    }}
                  >
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                        {p.name}
                        {!p.active && (
                          <span className="rounded-full bg-[#ececE6] text-[#898781] text-[11px] px-2 py-0.5">
                            archived
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {assignedAgents.length ? (
                        <button
                          className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px]"
                          onClick={() => setAssignedAgentsFor(p)}
                        >
                          View assigned agents
                        </button>
                      ) : (
                        <span className="text-[#898781]">none</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] mr-1.5"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await setProjectActive(p.id, !p.active);
                            refresh();
                          })
                        }
                      >
                        {p.active ? "Archive" : "Restore"}
                      </button>
                      <button
                        className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] text-[#d03b3b]"
                        onClick={() => setDeleteTarget(p)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editingId === p.id && (
                    <tr className="border-b border-[#e1e0d9] bg-[#f9f9f7]">
                      <td colSpan={3} className="p-3.5">
                        <ProjectEditForm
                          project={p}
                          agents={agents}
                          assignments={assignments.filter((a) => a.project_id === p.id)}
                          onChanged={refresh}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-[#898781]">
                  No {statusFilter} projects{search ? " match your search" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {assignedAgentsFor && (
        <AssignedAgentsModal
          project={assignedAgentsFor}
          agents={agents}
          assignments={assignments.filter((a) => a.project_id === assignedAgentsFor.id)}
          onChanged={refresh}
          onClose={() => setAssignedAgentsFor(null)}
        />
      )}

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          hasHours={projectHasHours(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          onArchive={() =>
            startTransition(async () => {
              await setProjectActive(deleteTarget.id, false);
              setDeleteTarget(null);
              refresh();
            })
          }
          onDelete={() =>
            startTransition(async () => {
              await deleteProject(deleteTarget.id);
              setDeleteTarget(null);
              refresh();
            })
          }
        />
      )}
    </div>
  );
}

function ProjectEditForm({
  project,
  agents,
  assignments,
  onChanged,
}: {
  project: Project;
  agents: Agent[];
  assignments: ProjectAgent[];
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const assignedIds = new Set(assignments.map((a) => a.agent_id));

  function save() {
    startTransition(async () => {
      await updateProject(project.id, name, color);
      onChanged();
    });
  }

  return (
    <div className="flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}

function AssignedAgentsModal({
  project,
  agents,
  assignments,
  onChanged,
  onClose,
}: {
  project: Project;
  agents: Agent[];
  assignments: ProjectAgent[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const assigned = agents.filter((a) => assignments.some((asg) => asg.agent_id === a.id));

  function gotoAgent(agentId: string) {
    onClose();
    router.push(`/team?highlight=${agentId}`);
  }

  return (
    <Modal title={`Assigned to ${project.name}`} onClose={onClose} footer={<ModalButton onClick={onClose}>Close</ModalButton>}>
      <div className="max-h-[280px] overflow-y-auto border border-[#e1e0d9] rounded-lg p-1">
        {assigned.length ? (
          assigned.map((a) => (
            <ListRow key={a.id}>
              <span className="flex items-center gap-2">
                <RoleBadge role={a.role} />
                <button className="text-[#2a78d6] hover:underline" onClick={() => gotoAgent(a.id)}>
                  {a.name}
                </button>
              </span>
              <button
                className="text-[#d03b3b] text-[12px]"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await setProjectAssignment(project.id, a.id, false);
                    onChanged();
                  })
                }
              >
                Remove
              </button>
            </ListRow>
          ))
        ) : (
          <p className="text-[12.5px] text-[#898781] px-2 py-2">No agents assigned yet.</p>
        )}
      </div>
    </Modal>
  );
}

function DeleteProjectModal({
  project,
  hasHours,
  onClose,
  onArchive,
  onDelete,
}: {
  project: Project;
  hasHours: boolean;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirmingHardDelete, setConfirmingHardDelete] = useState(false);

  if (hasHours && !confirmingHardDelete) {
    return (
      <Modal
        title={`Delete ${project.name}?`}
        subtitle="This project has logged hours against it."
        onClose={onClose}
        footer={
          <>
            <ModalButton onClick={onClose}>Cancel</ModalButton>
            <ModalButton variant="danger" onClick={() => setConfirmingHardDelete(true)}>
              Delete permanently instead
            </ModalButton>
            <ModalButton variant="primary" onClick={onArchive}>
              Archive instead
            </ModalButton>
          </>
        }
      >
        <p className="text-[13px] text-[#52514e]">
          Archiving hides it from active views but keeps every logged hour. Deleting removes the project and
          permanently erases all timesheet entries and leads logged against it — that can&rsquo;t be undone.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Delete ${project.name}?`}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="danger" onClick={onDelete}>
            Delete permanently
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] text-[#52514e]">
        {hasHours
          ? "This permanently erases all timesheet entries and leads logged against it. This can't be undone."
          : "This can't be undone."}
      </p>
    </Modal>
  );
}
