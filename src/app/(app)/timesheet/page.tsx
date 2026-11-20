import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import TimesheetGrid from "./TimesheetGrid";
import HoursChangedBanner from "./HoursChangedBanner";
import HoursLeftStrip, { type HoursLeftItem } from "./HoursLeftStrip";
import { loggedPerWeek } from "@/lib/hoursData";
import { halfToHours, type HourWeek } from "@/lib/hours";
import { UK_ZONE, todayIn, zoneOf } from "@/lib/timezones";
import { fetchAll } from "@/lib/aggregates";
import type {
  Agent,
  GridView,
  HistoryProject,
  Lead,
  LeadType,
  Project,
  TimesheetEntry,
} from "@/lib/types";

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
  searchParams: Promise<{
    agent?: string;
    month?: string;
    view?: string;
    week?: string;
    day?: string;
    tz?: string;
  }>;
}) {
  const me = await requireAgent();
  const params = await searchParams;

  const supabase = await createClient();

  // Admins can view/edit any agent's timesheet via ?agent=<id>; everyone else
  // only ever sees their own.
  let viewingId = me.id;
  if (me.role === "admin" && params.agent) viewingId = params.agent;

  const [
    { data: viewingAgent },
    { data: allAgents },
    { data: allProjects },
    { data: assignments },
  ] = await Promise.all([
    supabase.from("agents").select("*").eq("id", viewingId).maybeSingle(),
    me.role === "admin"
      ? supabase.from("agents").select("*").order("name")
      : Promise.resolve({ data: null }),
    supabase.from("projects").select("*").order("name"),
    supabase
      .from("project_agents")
      .select("project_id, agent_id")
      .eq("agent_id", viewingId),
  ]);

  const viewing: Agent = (viewingAgent as Agent) ?? me;
  const assignedProjectIds = new Set(
    (assignments ?? []).map((a) => a.project_id),
  );
  // myProjects = what the agent can paint with (assigned + active). Everything
  // else stays known to the grid so hours already logged on a project they've
  // since been unassigned from (or that was deactivated) still show, read-only.
  const everyProject = (allProjects as Project[]) ?? [];
  const myProjects: Project[] = everyProject.filter(
    (p) => assignedProjectIds.has(p.id) && p.active,
  );
  const historyProjects: HistoryProject[] = everyProject
    .filter((p) => !(assignedProjectIds.has(p.id) && p.active))
    .map((p) => ({
      ...p,
      reason: assignedProjectIds.has(p.id)
        ? ("inactive" as const)
        : ("unassigned" as const),
    }));

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

  // The grid is drawn on the viewed agent's own clock (their timezone, set by
  // an admin on the Team page; UK if none): that's what they type and see. The
  // database stores UK time and converts both ways. An admin can switch the
  // grid to UK time with ?tz=uk. "Today" and the default month/week follow
  // whichever clock is showing.
  const agentZone = zoneOf(viewing.timezone);
  const zoneMode: "local" | "uk" =
    me.role === "admin" && params.tz === "uk" ? "uk" : "local";
  const zone = zoneMode === "uk" ? UK_ZONE : agentZone;
  const today = todayIn(zone);
  const month = params.month || today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${pad2(new Date(y, m, 0).getDate())}`;

  const weekStart =
    params.week || dkey(mondayOf(new Date(`${today}T00:00:00`)));
  const weekEnd = addDaysStr(weekStart, 6);

  const day =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : today;

  // The visible grid range: the whole calendar month, or just the 7 days of
  // the active week (which may straddle two months) - only this range's
  // entries need to be fetched, not the whole month regardless of view.
  const rangeStart =
    view === "day" ? day : view === "week" ? weekStart : monthStart;
  const rangeEnd = view === "day" ? day : view === "week" ? weekEnd : monthEnd;

  // Leads are tracked per calendar month (not per week - there's no weekly
  // lead-tracking concept in the data model), so in Week view they're scoped
  // to the month containing the visible week's first day.
  const leadsPeriod =
    view === "day"
      ? day.slice(0, 7)
      : view === "week"
        ? weekStart.slice(0, 7)
        : month;

  const [entries, { data: leads }, { data: leadTypes }] = await Promise.all([
    // Paged: a month on a 24-hour schedule is up to 1488 slots, over the
    // API's 1000-row cap.
    // entries_local returns each entry's date/slot on the grid's clock.
    fetchAll<TimesheetEntry>(
      (from, to) =>
        supabase
          .rpc("entries_local", {
            p_agent: viewingId,
            p_from: rangeStart,
            p_to: rangeEnd,
            p_tz: zone,
          })
          .order("starts_at")
          .range(from, to) as unknown as PromiseLike<{
          data: TimesheetEntry[] | null;
          error: { message: string } | null;
        }>,
    ),
    supabase
      .from("leads")
      .select("*")
      .eq("agent_id", viewingId)
      .eq("period", leadsPeriod),
    supabase.from("lead_types").select("*").order("name"),
  ]);
  // "Hours changed" notice: only on an agent's own timesheet, only while their
  // flag is unacknowledged. If the Assign Hours tables aren't installed yet this
  // simply returns nothing.
  let hoursChangedAt: string | null = null;
  if (me.role === "agent" && viewing.id === me.id) {
    const { data: flag } = await supabase
      .from("hours_flags")
      .select("changed_at, seen_at")
      .eq("agent_id", me.id)
      .maybeSingle();
    if (flag && !flag.seen_at) hoursChangedAt = flag.changed_at as string;
  }

  // Hours left: per campaign with an assigned week running today (UK date),
  // this week's logged vs assigned plus the campaign total. Campaigns with no
  // such week are simply not listed; logging is never blocked by it.
  const hoursLeft: HoursLeftItem[] = [];
  try {
    const projectIds = myProjects.map((p) => p.id);
    if (projectIds.length > 0) {
      const ukToday = todayIn(UK_ZONE);
      const [weeks, mine, logged] = await Promise.all([
        fetchAll<HourWeek>(
          (f, t) =>
            supabase
              .from("hour_weeks")
              .select("id, project_id, start_date, end_date")
              .in("project_id", projectIds)
              .order("start_date")
              .order("id")
              .range(f, t) as never
        ),
        fetchAll<{ week_id: string; hours: number }>(
          (f, t) =>
            supabase
              .from("hour_assignments")
              .select("week_id, hours")
              .eq("agent_id", viewing.id)
              .order("week_id")
              .range(f, t) as never
        ),
        loggedPerWeek(supabase, viewing.id),
      ]);
      const assignedOf = new Map(mine.map((m) => [m.week_id, Number(m.hours)]));
      const loggedOf = new Map(logged.filter((l) => l.agent_id === viewing.id).map((l) => [l.week_id, halfToHours(l.half_hours)]));
      for (const p of myProjects) {
        const ws = weeks.filter((w) => w.project_id === p.id);
        const current = ws
          .filter((w) => w.start_date <= ukToday && ukToday <= w.end_date && assignedOf.has(w.id))
          .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
        if (!current) continue;
        hoursLeft.push({
          projectId: p.id,
          name: p.name,
          color: p.color,
          weekStart: current.start_date,
          weekEnd: current.end_date,
          weekAssigned: assignedOf.get(current.id) ?? 0,
          weekLogged: loggedOf.get(current.id) ?? 0,
          totalAssigned: ws.reduce((s, w) => s + (assignedOf.get(w.id) ?? 0), 0),
          totalLogged: ws.reduce((s, w) => s + (loggedOf.get(w.id) ?? 0), 0),
        });
      }
    }
  } catch {
    /* Assign Hours tables not installed yet: no strip */
  }

  return (
    <>
      {hoursChangedAt && (
        <HoursChangedBanner key={hoursChangedAt} changedAt={hoursChangedAt} />
      )}
      <HoursLeftStrip items={hoursLeft} />
      <TimesheetGrid
        key={viewing.id}
        me={me}
        viewing={viewing}
        agents={(allAgents as Agent[]) ?? []}
        view={view}
        month={month}
        weekStart={weekStart}
        day={day}
        zone={zone}
        zoneMode={zoneMode}
        agentZone={agentZone}
        projects={myProjects}
        historyProjects={historyProjects}
        entries={entries}
        leads={(leads as Lead[]) ?? []}
        leadTypes={(leadTypes as LeadType[]) ?? []}
      />
    </>
  );
}
