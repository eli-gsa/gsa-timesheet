"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { fetchAll } from "@/lib/aggregates";
import { UK_ZONE, zoneOf } from "@/lib/timezones";

// A cell as the person looking at the grid sees it: a date and half-hour slot
// on THEIR clock (the agent's own timezone, or UK time for an admin who has
// switched the grid to UK). The database converts to the real instant, and
// from there to UK time, which is what is stored and reported.
export type CellRef = { date: string; slot: number };

// "local" = the agent's own timezone; "uk" = UK time (admins only).
export type ZoneMode = "local" | "uk";

type Sb = Awaited<ReturnType<typeof createClient>>;
type Me = NonNullable<Awaited<ReturnType<typeof getCurrentAgent>>>;

// The zone the grid was drawn in. Only an admin can ask for UK; anyone else
// always works in the viewed agent's own zone.
async function resolveZone(supabase: Sb, me: Me, agentId: string, mode: ZoneMode): Promise<string> {
  if (mode === "uk" && me.role === "admin") return UK_ZONE;
  const { data } = await supabase.from("agents").select("timezone").eq("id", agentId).maybeSingle();
  return zoneOf((data?.timezone as string | null | undefined) ?? null);
}

// An agent can only paint with projects they're currently assigned to (and
// that are active), and can't touch hours already logged on a project they've
// been unassigned from or that was deactivated: those stay as a record.
// Admins are exempt (they can correct anything). Migration 0011 enforces the
// unassigned half of this in the database as well.
async function assertCellsEditable(
  supabase: Sb,
  me: Me,
  agentId: string,
  zone: string,
  cells: CellRef[],
  paintProjectId: string | null
) {
  if (me.role === "admin") return;

  const { data: pa } = await supabase.from("project_agents").select("project_id").eq("agent_id", agentId);
  const { data: act } = await supabase.from("projects").select("id").eq("active", true);
  const activeIds = new Set((act ?? []).map((p) => p.id as string));
  const open = new Set((pa ?? []).map((r) => r.project_id as string).filter((id) => activeIds.has(id)));

  if (paintProjectId && !open.has(paintProjectId)) {
    throw new Error("You are not assigned to that project");
  }

  const dates = cells.map((c) => c.date).sort();
  const wanted = new Set(cells.map((c) => `${c.date}|${c.slot}`));
  const existing = await fetchAll<{ entry_date: string; slot: number; project_id: string }>(
    (from, to) =>
      supabase
        .rpc("entries_local", { p_agent: agentId, p_from: dates[0], p_to: dates[dates.length - 1], p_tz: zone })
        .order("starts_at")
        .range(from, to) as unknown as PromiseLike<{
        data: { entry_date: string; slot: number; project_id: string }[] | null;
        error: { message: string } | null;
      }>
  );
  if (existing.some((e) => wanted.has(`${e.entry_date}|${e.slot}`) && !open.has(e.project_id))) {
    throw new Error(
      "Some of those slots hold hours on a project you're no longer assigned to. Those are locked; ask an admin to change them."
    );
  }
}

// Assigns a project to a batch of cells for one agent. Used by the timesheet
// grid's "Assign project" action on a multi-select. Upserts so re-assigning an
// already-filled cell just overwrites its project.
export async function assignSlots(agentId: string, cells: CellRef[], projectId: string, mode: ZoneMode = "local") {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");
  if (cells.length === 0) return;

  const supabase = await createClient();
  const zone = await resolveZone(supabase, me, agentId, mode);
  await assertCellsEditable(supabase, me, agentId, zone, cells, projectId);

  const { error } = await supabase.rpc("assign_slots_local", {
    p_agent: agentId,
    p_tz: zone,
    p_project: projectId,
    p_dates: cells.map((c) => c.date),
    p_slots: cells.map((c) => c.slot),
  });
  if (error) throw new Error(error.message);

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId,
    field: "timesheet_assign",
    newValue: `${project?.name ?? projectId} × ${cells.length} slot(s)${zone === UK_ZONE ? "" : ` (${zone} time)`}`,
  });

  revalidatePath("/timesheet");
}

// Clears (deletes) a batch of cells for one agent.
export async function clearSlots(agentId: string, cells: CellRef[], mode: ZoneMode = "local") {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");
  if (cells.length === 0) return;

  const supabase = await createClient();
  const zone = await resolveZone(supabase, me, agentId, mode);
  await assertCellsEditable(supabase, me, agentId, zone, cells, null);

  const { error } = await supabase.rpc("clear_slots_local", {
    p_agent: agentId,
    p_tz: zone,
    p_dates: cells.map((c) => c.date),
    p_slots: cells.map((c) => c.slot),
  });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "timesheet_clear",
    newValue: `cleared ${cells.length} slot(s)${zone === UK_ZONE ? "" : ` (${zone} time)`}`,
  });

  revalidatePath("/timesheet");
}

// Read-only: per-project half-hour counts + the standard work day length (in
// hours), for the Project Summary modal's own month/week navigation
// (independent of the page's own range) - it needs to fetch totals for
// whatever range the modal is currently showing, on demand. Takes an
// explicit [startDate, endDate] range (inclusive, on the grid's clock) rather
// than a calendar month so the same action serves both Month view and Week
// view.
export async function getAgentRangeTotals(
  agentId: string,
  startDate: string,
  endDate: string,
  mode: ZoneMode = "local"
): Promise<{ totals: Record<string, number>; standardDayHours: number }> {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");

  const supabase = await createClient();
  const zone = await resolveZone(supabase, me, agentId, mode);

  const [{ data: rows, error }, { data: setting }] = await Promise.all([
    supabase.rpc("agent_range_totals_local", { p_agent: agentId, p_from: startDate, p_to: endDate, p_tz: zone }),
    supabase.from("settings").select("value").eq("key", "standard_work_day").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);

  const totals: Record<string, number> = {};
  for (const r of (rows ?? []) as { project_id: string; half_hours: number }[]) {
    totals[r.project_id] = Number(r.half_hours); // half-hours
  }
  const win = (setting?.value as { startSlot: number; endSlot: number } | undefined) ?? {
    startSlot: 16,
    endSlot: 34,
  };
  const standardDayHours = Math.max(0.5, (win.endSlot - win.startSlot) * 0.5);

  return { totals, standardDayHours };
}
