import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, ProjectAgent } from "@/lib/types";
import { projectIdsWithHours } from "@/lib/aggregates";
import { loadGroups } from "@/lib/hoursData";
import ProjectsPanel from "./ProjectsPanel";
import GroupsPanel from "./GroupsPanel";

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: projects }, { data: agents }, { data: assignments }, projectIdsWithHoursList, groups] = await Promise.all([
    supabase.from("projects").select("*").order("name"),
    supabase.from("agents").select("*").order("name"),
    supabase.from("project_agents").select("*"),
    projectIdsWithHours(supabase),
    loadGroups(supabase),
  ]);

  return (
    <>
      <ProjectsPanel
        projects={(projects as Project[]) ?? []}
        agents={(agents as Agent[]) ?? []}
        assignments={(assignments as ProjectAgent[]) ?? []}
        projectIdsWithHours={projectIdsWithHoursList}
        groups={
          <GroupsPanel
            projects={((projects as Project[]) ?? []).map((p) => ({ id: p.id, name: p.name, active: p.active }))}
            groups={groups}
          />
        }
      />
    </>
  );
}
