"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { logAudit } from "@/lib/audit";

export type CellRef = { date: string; slot: number };

// Assigns a project to a batch of (date, slot) cells for one agent. Used by
// the timesheet grid's "Assign project" action on a multi-select. Upserts so
// re-assigning an already-filled cell just overwrites its project.
export async function assignSlots(agentId: string, cells: CellRef[], projectId: string) {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");
  if (cells.length === 0) return;

  const supabase = await createClient();

  const rows = cells.map((c) => ({
    agent_id: agentId,
    project_id: projectId,
    entry_date: c.date,
    slot: c.slot,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("timesheet_entries")
    .upsert(rows, { onConflict: "agent_id,entry_date,slot" });
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
    newValue: `${project?.name ?? projectId} × ${cells.length} slot(s)`,
  });

  revalidatePath("/timesheet");
}

// Clears (deletes) a batch of (date, slot) cells for one agent.
export async function clearSlots(agentId: string, cells: CellRef[]) {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");
  if (cells.length === 0) return;

  const supabase = await createClient();

  // Supabase doesn't support a multi-row OR-of-tuples delete in one call from
  // the JS client, so delete per unique date (batched by `in` on slot).
  const byDate = new Map<string, number[]>();
  for (const c of cells) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date)!.push(c.slot);
  }

  for (const [date, slots] of byDate) {
    const { error } = await supabase
      .from("timesheet_entries")
      .delete()
      .eq("agent_id", agentId)
      .eq("entry_date", date)
      .in("slot", slots);
    if (error) throw new Error(error.message);
  }

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "timesheet_clear",
    newValue: `cleared ${cells.length} slot(s)`,
  });

  revalidatePath("/timesheet");
}

// Read-only: per-project half-hour counts + the standard work day length (in
// hours), for the Project Summary modal's own month navigation (independent
// of the page's own month) - it needs to fetch totals for whatever month the
// modal is currently showing, on demand.
export async function getAgentMonthTotals(
  agentId: string,
  ym: string
): Promise<{ totals: Record<string, number>; standardDayHours: number }> {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");

  const supabase = await createClient();
  const [y, m] = ym.split("-").map(Number);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const [{ data: entries }, { data: setting }] = await Promise.all([
    supabase
      .from("timesheet_entries")
      .select("project_id")
      .eq("agent_id", agentId)
      .gte("entry_date", monthStart)
      .lte("entry_date", monthEnd),
    supabase.from("settings").select("value").eq("key", "standard_work_day").maybeSingle(),
  ]);

  const totals: Record<string, number> = {};
  for (const e of entries ?? []) {
    totals[e.project_id] = (totals[e.project_id] ?? 0) + 1; // half-hours
  }

  const win = (setting?.value as { startSlot: number; endSlot: number } | undefined) ?? {
    startSlot: 16,
    endSlot: 34,
  };
  const standardDayHours = Math.max(0.5, (win.endSlot - win.startSlot) * 0.5);

  return { totals, standardDayHours };
}
