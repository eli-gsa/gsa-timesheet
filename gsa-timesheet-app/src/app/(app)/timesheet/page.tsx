import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import TimesheetGrid from "./TimesheetGrid";
import type { Agent, Lead, LeadType, Project, TimesheetEntry } from "@/lib/types";

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; month?: string }>;
}) {
  const me = await requireAgent();
  const params = await searchParams;
  const month = params.month || currentYm();

  const supabase = await createClient();

  // Admins can view/edit any agent's timesheet via ?agent=<id>; everyone else
  // only ever sees their own.
  let viewingId = me.id;
  if (me.role === "admin" && params.agent) viewingId = params.agent;

  const [{ data: viewingAgent }, { data: allAgents }, { data: allProjects }, { data: assignments }] =
    await Promise.all([
      supabase.from("agents").select("*").eq("id", viewingId).maybeSingle(),
      me.role === "admin"
        ? supabase.from("agents").select("*").order("name")
        : Promise.resolve({ data: null }),
      supabase.from("projects").select("*").eq("active", true).order("name"),
      supabase.from("project_agents").select("project_id, agent_id").eq("agent_id", viewingId),
    ]);

  const viewing: Agent = (viewingAgent as Agent) ?? me;
  const assignedProjectIds = new Set((assignments ?? []).map((a) => a.project_id));
  const myProjects: Project[] = ((allProjects as Project[]) ?? []).filter((p) =>
    assignedProjectIds.has(p.id)
  );

  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  const [{ data: entries }, { data: leads }, { data: leadTypes }] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select("*")
      .eq("agent_id", viewingId)
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd),
    supabase.from("leads").select("*").eq("agent_id", viewingId).eq("period", month),
    supabase.from("lead_types").select("*").order("name"),
  ]);

  return (
    <TimesheetGrid
      me={me}
      viewing={viewing}
      agents={(allAgents as Agent[]) ?? []}
      month={month}
      projects={myProjects}
      entries={(entries as TimesheetEntry[]) ?? []}
      leads={(leads as Lead[]) ?? []}
      leadTypes={(leadTypes as LeadType[]) ?? []}
    />
  );
}
