import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, TimesheetEntry } from "@/lib/types";
import ReportsClient from "./ReportsClient";

function defaultFrom() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; agent?: string; project?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const from = params.from || defaultFrom();
  const to = params.to || defaultTo();

  const supabase = await createClient();

  let query = supabase
    .from("timesheet_entries")
    .select("*")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date");

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.project && params.project !== "all") query = query.eq("project_id", params.project);

  const [{ data: entries }, { data: agents }, { data: projects }] = await Promise.all([
    query,
    supabase.from("agents").select("*").order("name"),
    supabase.from("projects").select("*").order("name"),
  ]);

  return (
    <ReportsClient
      entries={(entries as TimesheetEntry[]) ?? []}
      agents={(agents as Agent[]) ?? []}
      projects={(projects as Project[]) ?? []}
      from={from}
      to={to}
      agentFilter={params.agent || "all"}
      projectFilter={params.project || "all"}
    />
  );
}
