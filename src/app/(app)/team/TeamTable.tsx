"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Agent, Project, ProjectAgent, Role } from "@/lib/types";
import { fmtHours } from "@/lib/types";
import { deleteAgent, setAgentActive, updateAgentRole } from "@/lib/actions/agents";
import Modal, { ListRow, ModalButton } from "@/components/Modal";
import { useRowHighlight } from "@/components/useRowHighlight";

export default function TeamTable({
  agents,
  projects,
  assignments,
  hoursByAgent,
  agentIdsWithHours,
}: {
  agents: Agent[];
  projects: Project[];
  assignments: ProjectAgent[];
  hoursByAgent: Record<string, number>;
  agentIdsWithHours: string[];
}) {
  const router = useRouter();
  useRowHighlight("data-team-row");
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [assignedProjectsFor, setAssignedProjectsFor] = useState<Agent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const hasHoursSet = new Set(agentIdsWithHours);

  function refresh() {
    router.refresh();
  }

  const list = agents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) && a.active === (statusFilter === "active")
  );

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[19px] font-semibold">Agents</h2>
        <p className="text-[12.5px] text-[#898781] mt-1">
          Anyone who has signed in with a Workspace Google account appears here automatically. To add
          someone new, create their email on Google Workspace — they&rsquo;ll show up the first time
          they sign in.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3">
        <input
          type="text"
          placeholder="Search by name…"
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
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Name</th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Role</th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">
                Assigned projects
              </th>
              <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">
                Hours this month
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-[#898781]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const assignedProjects = projects.filter((p) =>
                assignments.some((asg) => asg.agent_id === a.id && asg.project_id === p.id)
              );
              return (
                <tr key={a.id} data-team-row={a.id} className="border-b border-[#e1e0d9] hover:bg-[#f3f2ee]">
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">
                    <select
                      className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12.5px]"
                      value={a.role}
                      disabled={isPending}
                      onChange={(e) =>
                        startTransition(async () => {
                          await updateAgentRole(a.id, e.target.value as Role);
                          refresh();
                        })
                      }
                    >
                      <option value="agent">agent</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {assignedProjects.length ? (
                      <button
                        className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px]"
                        onClick={() => setAssignedProjectsFor(a)}
                      >
                        View assigned projects
                      </button>
                    ) : (
                      <span className="text-[#898781]">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtHours(hoursByAgent[a.id] ?? 0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] mr-1.5"
                      onClick={() => router.push(`/timesheet?agent=${a.id}`)}
                    >
                      View timesheet
                    </button>
                    <button
                      className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] mr-1.5"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setAgentActive(a.id, !a.active);
                          refresh();
                        })
                      }
                    >
                      {a.active ? "Archive" : "Restore"}
                    </button>
                    <button
                      className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1 text-[12px] text-[#d03b3b]"
                      onClick={() => setDeleteTarget(a)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[#898781]">
                  No {statusFilter} agents{search ? " match your search" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {assignedProjectsFor && (
        <AssignedProjectsModal
          agent={assignedProjectsFor}
          projects={projects.filter((p) =>
            assignments.some((asg) => asg.agent_id === assignedProjectsFor.id && asg.project_id === p.id)
          )}
          onClose={() => setAssignedProjectsFor(null)}
        />
      )}

      {deleteTarget && (
        <DeleteAgentModal
          agent={deleteTarget}
          hasHours={hasHoursSet.has(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          onArchive={() =>
            startTransition(async () => {
              await setAgentActive(deleteTarget.id, false);
              setDeleteTarget(null);
              refresh();
            })
          }
          onDelete={() =>
            startTransition(async () => {
              await deleteAgent(deleteTarget.id);
              setDeleteTarget(null);
              refresh();
            })
          }
        />
      )}
    </div>
  );
}

function AssignedProjectsModal({
  agent,
  projects,
  onClose,
}: {
  agent: Agent;
  projects: Project[];
  onClose: () => void;
}) {
  const router = useRouter();
  function gotoProject(projectId: string) {
    onClose();
    router.push(`/projects?highlight=${projectId}`);
  }
  return (
    <Modal title={`Projects: ${agent.name}`} onClose={onClose} footer={<ModalButton onClick={onClose}>Close</ModalButton>}>
      <div className="max-h-[280px] overflow-y-auto border border-[#e1e0d9] rounded-lg p-1">
        {projects.length ? (
          projects.map((p) => (
            <ListRow key={p.id}>
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                <button className="text-[#2a78d6] hover:underline" onClick={() => gotoProject(p.id)}>
                  {p.name}
                </button>
              </span>
            </ListRow>
          ))
        ) : (
          <p className="text-[12.5px] text-[#898781] px-2 py-2">No projects assigned yet.</p>
        )}
      </div>
    </Modal>
  );
}

function DeleteAgentModal({
  agent,
  hasHours,
  onClose,
  onArchive,
  onDelete,
}: {
  agent: Agent;
  hasHours: boolean;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirmingHardDelete, setConfirmingHardDelete] = useState(false);

  if (hasHours && !confirmingHardDelete) {
    return (
      <Modal
        title={`Delete ${agent.name}?`}
        subtitle="This agent has logged hours."
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
          Archiving retires them without losing any of their logged hours. Deleting removes the agent and
          permanently erases every timesheet entry and lead they&rsquo;ve logged — that can&rsquo;t be
          undone.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Delete ${agent.name}?`}
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
          ? "This permanently erases every timesheet entry and lead they've logged. This can't be undone."
          : "This can't be undone."}
      </p>
    </Modal>
  );
}
