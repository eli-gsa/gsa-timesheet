import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, ProjectAgent } from "@/lib/types";
import TeamTable from "./TeamTable";

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function TeamPage() {
  await requireAdmin();
  const supabase = await createClient();
  const month = currentYm();
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const [{ data: agents }, { data: projects }, { data: assignments }, { data: monthEntries }, { data: allEntries }] =
    await Promise.all([
      supabase.from("agents").select("*").order("name"),
      supabase.from("projects").select("*").order("name"),
      supabase.from("project_agents").select("*"),
      supabase
        .from("timesheet_entries")
        .select("agent_id")
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd),
      supabase.from("timesheet_entries").select("agent_id"),
    ]);

  const hoursByAgent: Record<string, number> = {};
  for (const e of monthEntries ?? []) {
    hoursByAgent[e.agent_id] = (hoursByAgent[e.agent_id] ?? 0) + 0.5;
  }
  const agentIdsWithHours = Array.from(new Set((allEntries ?? []).map((e) => e.agent_id)));

  return (
    <TeamTable
      agents={(agents as Agent[]) ?? []}
      projects={(projects as Project[]) ?? []}
      assignments={(assignments as ProjectAgent[]) ?? []}
      hoursByAgent={hoursByAgent}
      agentIdsWithHours={agentIdsWithHours}
    />
  );
}
