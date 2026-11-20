import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, Project, TimesheetEntry } from "@/lib/types";
import ReportsClient from "./ReportsClient";
import { fetchAll } from "@/lib/aggregates";
import { UK_ZONE, todayIn } from "@/lib/timezones";

// Reports are in UK time: default range = this UK month so far.
function defaultFrom() {
  return `${todayIn(UK_ZONE).slice(0, 7)}-01`;
}
function defaultTo() {
  return todayIn(UK_ZONE);
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

  // Read in pages of 1000: the API caps one request at 1000 rows, and a busy
  // date range has many more entries than that. The order is a unique key so
  // pages never overlap or skip.
  const entriesPromise = fetchAll<TimesheetEntry>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("timesheet_entries")
      .select("*")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date")
      .order("agent_id")
      .order("slot")
      .range(rangeFrom, rangeTo);
    if (params.agent && params.agent !== "all") q = q.eq("agent_id", params.agent);
    if (params.project && params.project !== "all") q = q.eq("project_id", params.project);
    return q as unknown as PromiseLike<{ data: TimesheetEntry[] | null; error: { message: string } | null }>;
  });

  const [entries, { data: agents }, { data: projects }] = await Promise.all([
    entriesPromise,
    supabase.from("agents").select("*").order("name"),
    supabase.from("projects").select("*").order("name"),
  ]);

  return (
    <ReportsClient
      entries={entries}
      agents={(agents as Agent[]) ?? []}
      projects={(projects as Project[]) ?? []}
      from={from}
      to={to}
      agentFilter={params.agent || "all"}
      projectFilter={params.project || "all"}
    />
  );
}
