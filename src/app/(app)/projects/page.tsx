import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { todayIn } from "@/lib/timezones";
import { mapStatusRows } from "@/lib/allocation";
import type { Agent, Project, ProjectAgent, TimesheetEntry } from "@/lib/types";
import ProjectsPanel from "./ProjectsPanel";

export default async function ProjectsPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [{ data: projects }, { data: agents }, { data: assignments }, { data: entries }, { data: statusRows }] =
    await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("agents").select("*").order("name"),
      supabase.from("project_agents").select("*"),
      supabase.from("timesheet_entries").select("project_id"),
      // Open allocations for everyone (admin). Errors to null if migration
      // 0009 hasn't been run, and the page simply shows no allocations.
      supabase.rpc("allocation_status", { p_agent: null, p_today: todayIn(me.timezone), p_include_closed: false }),
    ]);

  return (
    <ProjectsPanel
      projects={(projects as Project[]) ?? []}
      agents={(agents as Agent[]) ?? []}
      assignments={(assignments as ProjectAgent[]) ?? []}
      entries={(entries as Pick<TimesheetEntry, "project_id">[]) ?? []}
      allocStatus={mapStatusRows(statusRows)}
    />
  );
}
