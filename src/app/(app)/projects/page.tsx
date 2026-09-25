import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, ProjectAgent, TimesheetEntry } from "@/lib/types";
import ProjectsPanel from "./ProjectsPanel";

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: projects }, { data: agents }, { data: assignments }, { data: entries }] =
    await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("agents").select("*").order("name"),
      supabase.from("project_agents").select("*"),
      supabase.from("timesheet_entries").select("project_id"),
    ]);

  return (
    <ProjectsPanel
      projects={(projects as Project[]) ?? []}
      agents={(agents as Agent[]) ?? []}
      assignments={(assignments as ProjectAgent[]) ?? []}
      entries={(entries as Pick<TimesheetEntry, "project_id">[]) ?? []}
    />
  );
}
