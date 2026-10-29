import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import TimesheetGrid from "./TimesheetGrid";
import { todayIn } from "@/lib/timezones";
import { mapStatusRows } from "@/lib/allocation";
import type { Agent, GridView, Lead, LeadType, Project, TimesheetEntry } from "@/lib/types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function dkey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// Monday of the week containing d (ISO-style week start).
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(r.getDate() + diff);
  return r;
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dkey(d);
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; month?: string; view?: string; week?: string; day?: string }>;
}) {
  const me = await requireAgent();
  const params = await searchParams;

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
      supabase.from("project_agents").select("project_id, agent_id, allocated_hours").eq("agent_id", viewingId),
    ]);

  const viewing: Agent = (viewingAgent as Agent) ?? me;
  const assignedProjectIds = new Set((assignments ?? []).map((a) => a.project_id));
  const myProjects: Project[] = ((allProjects as Project[]) ?? []).filter((p) =>
    assignedProjectIds.has(p.id)
  );

  // Resolve the active view: an explicit ?view= wins, otherwise fall back to
  // the agent's own persisted preference (set via the Month/Week toggle).
  // "day" is URL-only (never persisted as an agent's default).
  const view: GridView =
    params.view === "day"
      ? "day"
      : params.view === "week"
      ? "week"
      : params.view === "month"
      ? "month"
      : viewing.timesheet_view;

  // "Today" is the viewed agent's local date (their timezone, set by an
  // admin on the Team page), so the default month/week roll over at their
  // midnight rather than the server's. No timezone set = server date, as before.
  const today = todayIn(viewing.timezone);
  const month = params.month || today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${pad2(new Date(y, m, 0).getDate())}`;

  const weekStart = params.week || dkey(mondayOf(new Date(`${today}T00:00:00`)));
  const weekEnd = addDaysStr(weekStart, 6);

  const day = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;

  // The visible grid range: the whole calendar month, or just the 7 days of
  // the active week (which may straddle two months) - only this range's
  // entries need to be fetched, not the whole month regardless of view.
  const rangeStart = view === "day" ? day : view === "week" ? weekStart : monthStart;
  const rangeEnd = view === "day" ? day : view === "week" ? weekEnd : monthEnd;

  // Leads are tracked per calendar month (not per week - there's no weekly
  // lead-tracking concept in the data model), so in Week view they're scoped
  // to the month containing the visible week's first day.
  const leadsPeriod = view === "day" ? day.slice(0, 7) : view === "week" ? weekStart.slice(0, 7) : month;

  const [{ data: entries }, { data: leads }, { data: leadTypes }, { data: statusRows }] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select("*")
      .eq("agent_id", viewingId)
      .gte("entry_date", rangeStart)
      .lte("entry_date", rangeEnd),
    supabase.from("leads").select("*").eq("agent_id", viewingId).eq("period", leadsPeriod),
    supabase.from("lead_types").select("*").order("name"),
    // Open allocations (hours-remaining) with their figures. If the function
    // doesn't exist yet (migration 0009 not run) this just errors to null and
    // the page works without the countdown.
    supabase.rpc("allocation_status", { p_agent: viewingId, p_today: today, p_include_closed: false }),
  ]);
  const allocStatus = mapStatusRows(statusRows).filter((a) => assignedProjectIds.has(a.projectId));

  return (
    <TimesheetGrid
      key={viewing.id}
      me={me}
      viewing={viewing}
      agents={(allAgents as Agent[]) ?? []}
      view={view}
      month={month}
      weekStart={weekStart}
      day={day}
      allocStatus={allocStatus}
      today={today}
      projects={myProjects}
      entries={(entries as TimesheetEntry[]) ?? []}
      leads={(leads as Lead[]) ?? []}
      leadTypes={(leadTypes as LeadType[]) ?? []}
    />
  );
}
