import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/aggregates";
import type { HourCell, HourColour, HourWeek } from "@/lib/hours";

type Sb = Awaited<ReturnType<typeof createClient>>;

export type AssignData = {
  weeks: HourWeek[];
  cells: HourCell[];
  colours: HourColour[];
  assigned: { project_id: string; agent_id: string }[];
};

// Everything the admin Assign Hours page shows (admin session: RLS lets them
// read it all). Paged, so it never hits the API's 1,000-row cap.
export async function loadAssignData(sb: Sb): Promise<AssignData> {
  const [weeks, cells, colours, assigned] = await Promise.all([
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
  ]);
  return {
    weeks,
    cells: cells.map((c) => ({ ...c, hours: Number(c.hours) })),
    colours,
    assigned,
  };
}
