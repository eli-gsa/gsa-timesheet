"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtHours } from "@/lib/types";
import { BarChartV, ChartDatum, LineChartMulti, PieChartWithLegend } from "@/components/charts";
import Modal, { ListRow, ModalButton, RoleBadge } from "@/components/Modal";

type ProjectDatum = ChartDatum & { id: string };
type AgentDatum = { id: string; label: string; value: number };
type AgentListEntry = { id: string; name: string; role: string; hours?: number };
type ProjectListEntry = { id: string; name: string; color: string };

export default function OverviewClient({
  monthLabel,
  totalHoursThisMonth,
  activeAgentsCount,
  totalAgentsCount,
  activeProjectsCount,
  avgHoursPerDay,
  byProject,
  byAgent,
  activeAgentsList,
  allAgentsList,
  activeProjectsList,
  dailyTrendLabels,
  dailyTrendValues,
}: {
  monthLabel: string;
  totalHoursThisMonth: number;
  activeAgentsCount: number;
  totalAgentsCount: number;
  activeProjectsCount: number;
  avgHoursPerDay: number;
  byProject: ProjectDatum[];
  byAgent: AgentDatum[];
  activeAgentsList: AgentListEntry[];
  allAgentsList: AgentListEntry[];
  activeProjectsList: ProjectListEntry[];
  dailyTrendLabels: string[];
  dailyTrendValues: number[];
}) {
  const [chartType, setChartType] = useState<"bar" | "pie">("bar");
  const [modal, setModal] = useState<
    "hours-breakdown" | "active-agents" | "all-agents" | "active-projects" | "project-chart" | "daily-chart" | null
  >(null);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[19px] font-semibold">Overview</h2>
        <p className="text-[12.5px] text-[#898781] mt-0.5">{monthLabel}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-6">
        <StatTile
          label="Hours logged this month"
          value={fmtHours(totalHoursThisMonth)}
          title="Click for a breakdown by agent and project"
          onClick={() => setModal("hours-breakdown")}
        />
        <StatTile
          label="Agents active this month"
          value={String(activeAgentsCount)}
          title="Click to see who's active"
          onClick={() => setModal("active-agents")}
        />
        <StatTile
          label="Total agents"
          value={String(totalAgentsCount)}
          title="Click to see the full team"
          onClick={() => setModal("all-agents")}
        />
        <StatTile
          label="Active projects"
          value={String(activeProjectsCount)}
          title="Click to see active projects"
          onClick={() => setModal("active-projects")}
        />
        <StatTile label="Avg hours / day so far" value={fmtHours(avgHoursPerDay)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4 cursor-pointer hover:border-[#c3c2b7]"
          title="Click to zoom in"
          onClick={() => byProject.length && setModal("project-chart")}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13.5px] font-semibold">Hours by Project: {monthLabel}</h3>
            {byProject.length > 0 && (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`rounded-md px-2 py-0.5 text-[11.5px] ${
                    chartType === "bar" ? "bg-[#2a78d6] text-white" : "border border-[#c3c2b7] bg-white"
                  }`}
                  onClick={() => setChartType("bar")}
                >
                  Bar
                </button>
                <button
                  className={`rounded-md px-2 py-0.5 text-[11.5px] ${
                    chartType === "pie" ? "bg-[#2a78d6] text-white" : "border border-[#c3c2b7] bg-white"
                  }`}
                  onClick={() => setChartType("pie")}
                >
                  Pie
                </button>
              </div>
            )}
          </div>
          {byProject.length ? (
            chartType === "pie" ? (
              <PieChartWithLegend data={byProject} />
            ) : (
              <BarChartV data={byProject} fmt={fmtHours} xLabel="Project" yLabel="Hours" />
            )
          ) : (
            <p className="text-[12.5px] text-[#898781]">No hours logged yet this month.</p>
          )}
        </div>

        <div
          className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4 cursor-pointer hover:border-[#c3c2b7]"
          title="Click to zoom in"
          onClick={() => setModal("daily-chart")}
        >
          <h3 className="text-[13.5px] font-semibold mb-3">Daily Hours: Last 30 Days</h3>
          <LineChartMulti
            series={[{ name: "All agents", color: "#2a78d6", values: dailyTrendValues }]}
            labels={dailyTrendLabels}
            xLabel="Date"
            yLabel="Number of Hours Logged"
          />
        </div>
      </div>

      {modal === "hours-breakdown" && (
        <HoursBreakdownModal
          monthLabel={monthLabel}
          totalHours={totalHoursThisMonth}
          byAgent={byAgent}
          byProject={byProject}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "active-agents" && (
        <AgentListModal
          title="Agents active this month"
          subtitle={`${monthLabel} · ${activeAgentsList.length} of ${totalAgentsCount} agents logged hours`}
          agents={activeAgentsList}
          showHours
          onClose={() => setModal(null)}
        />
      )}
      {modal === "all-agents" && (
        <AgentListModal
          title="Total agents"
          subtitle={`${allAgentsList.length} agent${allAgentsList.length === 1 ? "" : "s"} on the team`}
          agents={allAgentsList}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "active-projects" && (
        <ProjectListModal
          title="Active projects"
          subtitle={`${activeProjectsList.length} active project${activeProjectsList.length === 1 ? "" : "s"}`}
          projects={activeProjectsList}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "project-chart" && (
        <Modal
          title={`Hours by Project: ${monthLabel}`}
          onClose={() => setModal(null)}
          maxWidth={780}
          footer={<ModalButton onClick={() => setModal(null)}>Close</ModalButton>}
        >
          {chartType === "pie" ? (
            <PieChartWithLegend data={byProject} width={320} height={320} />
          ) : (
            <BarChartV data={byProject} fmt={fmtHours} width={720} height={420} xLabel="Project" yLabel="Hours" />
          )}
        </Modal>
      )}
      {modal === "daily-chart" && (
        <Modal
          title="Daily Hours: Last 30 Days"
          onClose={() => setModal(null)}
          maxWidth={820}
          footer={<ModalButton onClick={() => setModal(null)}>Close</ModalButton>}
        >
          <LineChartMulti
            series={[{ name: "All agents", color: "#2a78d6", values: dailyTrendValues }]}
            labels={dailyTrendLabels}
            width={760}
            height={360}
            xLabel="Date"
            yLabel="Number of Hours Logged"
          />
        </Modal>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  title,
  onClick,
}: {
  label: string;
  value: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg px-3.5 py-3 ${
        onClick ? "cursor-pointer hover:border-[#c3c2b7]" : ""
      }`}
      title={title}
      onClick={onClick}
    >
      <div className="text-[11.5px] text-[#898781]">{label}</div>
      <div className="text-[24px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function HoursBreakdownModal({
  monthLabel,
  totalHours,
  byAgent,
  byProject,
  onClose,
}: {
  monthLabel: string;
  totalHours: number;
  byAgent: AgentDatum[];
  byProject: ProjectDatum[];
  onClose: () => void;
}) {
  const router = useRouter();
  function gotoAgent(id: string) {
    onClose();
    router.push(`/team?highlight=${id}`);
  }
  function gotoProject(id: string) {
    onClose();
    router.push(`/projects?highlight=${id}`);
  }
  return (
    <Modal
      title="Hours logged this month"
      subtitle={`${monthLabel} · total ${fmtHours(totalHours)} h`}
      onClose={onClose}
      maxWidth={480}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      <h4 className="text-[12.5px] font-semibold mb-1.5">Hours per caller</h4>
      <div className="border border-[#e1e0d9] rounded-lg overflow-hidden mb-4">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="bg-[#f3f2ee]">
            <tr>
              <th className="text-left px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Agent</th>
              <th className="text-right px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Hours</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.length ? (
              byAgent.map((a) => (
                <tr key={a.id} className="border-t border-[#e1e0d9]">
                  <td className="px-2.5 py-1">
                    <button className="text-[#2a78d6] hover:underline" onClick={() => gotoAgent(a.id)}>
                      {a.label}
                    </button>
                  </td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(a.value)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-2.5 py-2 text-[#898781]">
                  No hours logged yet.
                </td>
              </tr>
            )}
            {byAgent.length > 0 && (
              <tr className="border-t border-[#e1e0d9] bg-[#f3f2ee]">
                <td className="px-2.5 py-1 font-semibold">Total</td>
                <td className="px-2.5 py-1 text-right tabular-nums font-semibold">{fmtHours(totalHours)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h4 className="text-[12.5px] font-semibold mb-1.5">Hours per project</h4>
      <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
        <table className="w-full text-[12.5px] border-collapse">
          <thead className="bg-[#f3f2ee]">
            <tr>
              <th className="text-left px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Project</th>
              <th className="text-right px-2.5 py-1.5 text-[11px] uppercase text-[#898781]">Hours</th>
            </tr>
          </thead>
          <tbody>
            {byProject.length ? (
              byProject.map((p) => (
                <tr key={p.id} className="border-t border-[#e1e0d9]">
                  <td className="px-2.5 py-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
                      <button className="text-[#2a78d6] hover:underline" onClick={() => gotoProject(p.id)}>
                        {p.label}
                      </button>
                    </span>
                  </td>
                  <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(p.value)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-2.5 py-2 text-[#898781]">
                  No hours logged yet.
                </td>
              </tr>
            )}
            {byProject.length > 0 && (
              <tr className="border-t border-[#e1e0d9] bg-[#f3f2ee]">
                <td className="px-2.5 py-1 font-semibold">Total</td>
                <td className="px-2.5 py-1 text-right tabular-nums font-semibold">{fmtHours(totalHours)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function AgentListModal({
  title,
  subtitle,
  agents,
  showHours,
  onClose,
}: {
  title: string;
  subtitle?: string;
  agents: AgentListEntry[];
  showHours?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  function gotoAgent(id: string) {
    onClose();
    router.push(`/team?highlight=${id}`);
  }
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} footer={<ModalButton onClick={onClose}>Close</ModalButton>}>
      <div className="max-h-[280px] overflow-y-auto border border-[#e1e0d9] rounded-lg p-1">
        {agents.length ? (
          agents.map((a) => (
            <ListRow key={a.id}>
              <span className="flex items-center gap-2">
                <RoleBadge role={a.role === "admin" ? "admin" : "agent"} />
                <button className="text-[#2a78d6] hover:underline" onClick={() => gotoAgent(a.id)}>
                  {a.name}
                </button>
              </span>
              {showHours && <span className="text-[#898781] tabular-nums">{fmtHours(a.hours ?? 0)} h</span>}
            </ListRow>
          ))
        ) : (
          <p className="text-[12.5px] text-[#898781] px-2 py-2">No agents to show.</p>
        )}
      </div>
    </Modal>
  );
}

function ProjectListModal({
  title,
  subtitle,
  projects,
  onClose,
}: {
  title: string;
  subtitle?: string;
  projects: ProjectListEntry[];
  onClose: () => void;
}) {
  const router = useRouter();
  function gotoProject(id: string) {
    onClose();
    router.push(`/projects?highlight=${id}`);
  }
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} footer={<ModalButton onClick={onClose}>Close</ModalButton>}>
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
          <p className="text-[12.5px] text-[#898781] px-2 py-2">No active projects.</p>
        )}
      </div>
    </Modal>
  );
}
