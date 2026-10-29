import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { redirect } from "next/navigation";
import OverviewClient from "./OverviewClient";
import { hoursByAgent, hoursByDay, hoursByProject } from "@/lib/aggregates";

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function dkey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function OverviewPage() {
  const me = await getCurrentAgent();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/timesheet");

  const supabase = await createClient();
  const month = currentYm();
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const today = new Date();
  const trendStart = new Date(today);
  trendStart.setDate(trendStart.getDate() - 29);

  // Totals are counted in the database: reading every entry would hit the
  // API's 1000-row cap and quietly under-count a busy month.
  const [{ data: agents }, { data: projects }, byAgentHH, byProjectHH, dailyHH] = await Promise.all([
    supabase.from("agents").select("id, name, role").order("name"),
    supabase.from("projects").select("id, name, color, active"),
    hoursByAgent(supabase, monthStart, monthEnd),
    hoursByProject(supabase, monthStart, monthEnd),
    hoursByDay(supabase, dkey(trendStart), dkey(today)),
  ]);

  const agentList = agents ?? [];
  const projectList = projects ?? [];
  const projectById = new Map(projectList.map((p) => [p.id, p]));
  const agentById = new Map(agentList.map((a) => [a.id, a]));

  const agentsLogged = new Set(byAgentHH.keys());
  const totalHours = Array.from(byAgentHH.values()).reduce((s, n) => s + n, 0) * 0.5;
  const elapsedDays = today.getDate();
  const avgHoursPerDay = elapsedDays ? totalHours / elapsedDays : 0;
  const activeProjects = projectList.filter((p) => p.active);

  const byProject = Array.from(byProjectHH.entries())
    .map(([pid, hh]) => {
      const p = projectById.get(pid);
      return { id: pid, label: p?.name ?? pid, value: hh * 0.5, color: p?.color ?? "#2a78d6" };
    })
    .sort((a, b) => b.value - a.value);

  const byAgent = Array.from(byAgentHH.entries())
    .map(([uid, hh]) => {
      const a = agentById.get(uid);
      return { id: uid, label: a?.name ?? uid, value: hh * 0.5 };
    })
    .sort((a, b) => b.value - a.value);

  const activeAgentsList = byAgent.map((a) => ({
    id: a.id,
    name: a.label,
    role: agentById.get(a.id)?.role ?? "agent",
    hours: a.value,
  }));

  const allAgentsList = agentList
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((a) => ({ id: a.id, name: a.name, role: a.role }));

  const activeProjectsList = activeProjects
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((p) => ({ id: p.id, name: p.name, color: p.color }));

  // Daily trend: last 30 days, total hours per day
  const dailyMap = new Map<string, number>();
  for (const [date, hh] of dailyHH) dailyMap.set(date, hh * 0.5);
  const trendLabels: string[] = [];
  const trendValues: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dkey(d);
    trendLabels.push(d.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
    trendValues.push(dailyMap.get(key) ?? 0);
  }

  return (
    <OverviewClient
      monthLabel={monthLabel(month)}
      totalHoursThisMonth={totalHours}
      activeAgentsCount={agentsLogged.size}
      totalAgentsCount={agentList.length}
      activeProjectsCount={activeProjects.length}
      avgHoursPerDay={avgHoursPerDay}
      byProject={byProject}
      byAgent={byAgent}
      activeAgentsList={activeAgentsList}
      allAgentsList={allAgentsList}
      activeProjectsList={activeProjectsList}
      dailyTrendLabels={trendLabels}
      dailyTrendValues={trendValues}
    />
  );
}
