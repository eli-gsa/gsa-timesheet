import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, ProjectAgent } from "@/lib/types";
import { hoursByAgent as aggHoursByAgent, agentIdsWithHours as agentIdsWithHoursFn } from "@/lib/aggregates";
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

  const [{ data: agents }, { data: projects }, { data: assignments }, monthHH, agentIdsWithHours] =
    await Promise.all([
      supabase.from("agents").select("*").order("name"),
      supabase.from("projects").select("*").order("name"),
      supabase.from("project_agents").select("*"),
      aggHoursByAgent(supabase, monthStart, monthEnd),
      agentIdsWithHoursFn(supabase),
    ]);

  const hoursByAgent: Record<string, number> = {};
  for (const [id, hh] of monthHH) hoursByAgent[id] = hh * 0.5;

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
