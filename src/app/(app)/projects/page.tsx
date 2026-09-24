import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, ProjectAgent, Rate } from "@/lib/types";
import ProjectsPanel from "./ProjectsPanel";

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: projects }, { data: agents }, { data: assignments }, { data: rates }] =
    await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("agents").select("*").order("name"),
      supabase.from("project_agents").select("*"),
      supabase.from("rates").select("*").order("effective_from", { ascending: false }),
    ]);

  return (
    <ProjectsPanel
      projects={(projects as Project[]) ?? []}
      agents={(agents as Agent[]) ?? []}
      assignments={(assignments as ProjectAgent[]) ?? []}
      rates={(rates as Rate[]) ?? []}
    />
  );
}
