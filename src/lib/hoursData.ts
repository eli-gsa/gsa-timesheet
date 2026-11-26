import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/aggregates";
import type { HourCell, HourColour, HourLogged, HourWeek, LeadCount, LeadRate } from "@/lib/hours";

type Sb = Awaited<ReturnType<typeof createClient>>;

export type AssignData = {
  weeks: HourWeek[];
  cells: HourCell[];
  colours: HourColour[];
  logged: HourLogged[];
  rates: LeadRate[];
  leadCounts: LeadCount[];
  currencies: Record<string, string>; // project_id -> currency code
  assigned: { project_id: string; agent_id: string }[];
};

// Everything the admin Assign Hours page shows (admin session: RLS lets them
// read it all). Paged, so it never hits the API's 1,000-row cap.
export async function loadAssignData(sb: Sb): Promise<AssignData> {
  const [weeks, cells, colours, assigned, logged, rates, leadCounts, currencies] = await Promise.all([
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
    leadRatesAll(sb),
    leadCountsPerWeek(sb, null),
    leadCurrencies(sb),
  ]);
  return {
    weeks,
    cells: cells.map((c) => ({ ...c, hours: Number(c.hours) })),
    colours,
    logged,
    rates,
    leadCounts,
    currencies,
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

// Lead bonus data (migration 0015). Each reader returns nothing if the tables or
// function aren't installed yet, so the page still loads before the SQL is run.
async function leadRatesAll(sb: Sb): Promise<LeadRate[]> {
  try {
    const rows = await fetchAll<LeadRate>(
      (f, t) =>
        sb.from("lead_bonus_rates").select("week_id, agent_id, amount").order("week_id").order("agent_id").range(f, t) as never
    );
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  } catch {
    return [];
  }
}

// Leads per agent per week, counted from the leads agents log (by lead date).
// agentId null = everyone (admin session).
export async function leadCountsPerWeek(sb: Sb, agentId: string | null): Promise<LeadCount[]> {
  try {
    const rows = await fetchAll<LeadCount>(
      (f, t) =>
        sb
          .rpc("lead_week_counts", { p_agent: agentId })
          .order("week_id")
          .order("agent_id")
          .range(f, t) as never
    );
    return rows.map((r) => ({ ...r, leads: Number(r.leads) }));
  } catch {
    return [];
  }
}

async function leadCurrencies(sb: Sb): Promise<Record<string, string>> {
  try {
    const { data, error } = await sb.from("lead_bonus_settings").select("project_id, currency");
    if (error) return {};
    return Object.fromEntries((data ?? []).map((r) => [r.project_id as string, r.currency as string]));
  } catch {
    return {};
  }
}

// Campaign groups (migration 0015) for the Projects tab and the Reports picker.
// Admin session only. Returns nothing if the tables aren't installed yet.
export type CampaignGroup = { id: string; name: string; projectIds: string[] };
export async function loadGroups(sb: Sb): Promise<CampaignGroup[]> {
  try {
    const [{ data: groups, error }, members] = await Promise.all([
      sb.from("project_groups").select("id, name").order("name"),
      fetchAll<{ group_id: string; project_id: string }>(
        (f, t) =>
          sb.from("project_group_members").select("group_id, project_id").order("group_id").order("project_id").range(f, t) as never
      ),
    ]);
    if (error) return [];
    return (groups ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      projectIds: members.filter((m) => m.group_id === g.id).map((m) => m.project_id),
    }));
  } catch {
    return [];
  }
}
