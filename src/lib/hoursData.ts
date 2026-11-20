import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/aggregates";
import type { HourCell, HourColour, HourLogged, HourWeek } from "@/lib/hours";

type Sb = Awaited<ReturnType<typeof createClient>>;

export type AssignData = {
  weeks: HourWeek[];
  cells: HourCell[];
  colours: HourColour[];
  logged: HourLogged[];
  assigned: { project_id: string; agent_id: string }[];
};

// Everything the admin Assign Hours page shows (admin session: RLS lets them
// read it all). Paged, so it never hits the API's 1,000-row cap.
export async function loadAssignData(sb: Sb): Promise<AssignData> {
  const [weeks, cells, colours, assigned, logged] = await Promise.all([
    fetchAll<HourWeek>(
      (f, t) =>
        sb.from("hour_weeks").select("id, project_id, start_date, end_date").order("start_date").order("id").range(f, t) as never
    ),
    fetchAll<HourCell>(
      (f, t) =>
        sb.from("hour_assignments").select("week_id, agent_id, hours").order("week_id").order("agent_id").range(f, t) as never
    ),
    fetchAll<HourColour>(
      (f, t) =>
        sb.from("hour_colours").select("week_id, agent_id, colour").order("week_id").order("agent_id").range(f, t) as never
    ),
    fetchAll<{ project_id: string; agent_id: string }>(
      (f, t) =>
        sb.from("project_agents").select("project_id, agent_id").order("project_id").order("agent_id").range(f, t) as never
    ),
    loggedPerWeek(sb, null),
  ]);
  return {
    weeks,
    cells: cells.map((c) => ({ ...c, hours: Number(c.hours) })),
    colours,
    logged,
    assigned,
  };
}

// Half-hours logged inside each week (UK dates), from migration 0014. If that
// function isn't installed yet this returns nothing, so the page still works.
// p_agent null = everyone (admin session); otherwise just that agent.
export async function loggedPerWeek(sb: Sb, agentId: string | null): Promise<HourLogged[]> {
  try {
    const rows = await fetchAll<HourLogged>(
      (f, t) =>
        sb
          .rpc("hour_week_logged", { p_agent: agentId })
          .order("week_id")
          .order("agent_id")
          .range(f, t) as never
    );
    return rows.map((r) => ({ ...r, half_hours: Number(r.half_hours) }));
  } catch {
    return [];
  }
}
