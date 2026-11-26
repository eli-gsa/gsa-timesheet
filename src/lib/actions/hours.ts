"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { UK_ZONE, todayIn } from "@/lib/timezones";
import { HOUR_COLOURS, addDaysStr, fmtRange, isDateStr, nextMonday } from "@/lib/hours";
import { COMMON_CURRENCIES } from "@/lib/invoicing";
import { loadAssignData, type AssignData } from "@/lib/hoursData";

async function admin() {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.role !== "admin") throw new Error("Admins only");
  return me;
}

// Agents' views read from the same tables, so refresh them after any admin edit.
function refreshAgentViews() {
  revalidatePath("/assigned-hours");
  revalidatePath("/timesheet");
}

// Fresh copy of everything, for the page's periodic refresh.
export async function getAssignData(): Promise<AssignData> {
  await admin();
  return loadAssignData(await createClient());
}

// Adds `count` consecutive Mon-Fri weeks to a campaign, starting at the Monday
// after its last week (or the next Monday from today, UK time, if it has none).
export async function addWeeks(projectId: string, count: number): Promise<HourWeekRow[]> {
  const me = await admin();
  const n = Math.floor(count);
  if (!(n >= 1 && n <= 26)) throw new Error("Choose between 1 and 26 weeks");
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("hour_weeks")
    .select("end_date")
    .eq("project_id", projectId)
    .order("end_date", { ascending: false })
    .limit(1);
  let start = nextMonday((last?.[0]?.end_date as string | undefined) ?? addDaysStr(todayIn(UK_ZONE), 0));
  const rows: { project_id: string; start_date: string; end_date: string; created_by: string }[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ project_id: projectId, start_date: start, end_date: addDaysStr(start, 4), created_by: me.id });
    start = nextMonday(start);
  }
  const { data, error } = await supabase.from("hour_weeks").insert(rows).select("id, project_id, start_date, end_date");
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    projectId,
    field: "hours_weeks_add",
    newValue: rows.map((r) => fmtRange(r.start_date, r.end_date)).join("; "),
  });
  refreshAgentViews();
  return (data ?? []) as HourWeekRow[];
}
type HourWeekRow = { id: string; project_id: string; start_date: string; end_date: string };

export async function updateWeek(weekId: string, start: string, end: string) {
  const me = await admin();
  if (!isDateStr(start) || !isDateStr(end)) throw new Error("Enter valid dates");
  if (start > end) throw new Error("A week can't end before it starts");
  const supabase = await createClient();
  const { data: before } = await supabase.from("hour_weeks").select("project_id, start_date, end_date").eq("id", weekId).maybeSingle();
  const { error } = await supabase.from("hour_weeks").update({ start_date: start, end_date: end }).eq("id", weekId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    projectId: (before?.project_id as string | undefined) ?? null,
    field: "hours_week_dates",
    oldValue: before ? fmtRange(before.start_date as string, before.end_date as string) : null,
    newValue: fmtRange(start, end),
  });
  refreshAgentViews();
}

// Removes the week and the hours assigned in it (logged timesheet hours are a
// different table and are never touched).
export async function deleteWeek(weekId: string) {
  const me = await admin();
  const supabase = await createClient();
  const { data: before } = await supabase.from("hour_weeks").select("project_id, start_date, end_date").eq("id", weekId).maybeSingle();
  const { error } = await supabase.from("hour_weeks").delete().eq("id", weekId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    projectId: (before?.project_id as string | undefined) ?? null,
    field: "hours_week_delete",
    oldValue: before ? fmtRange(before.start_date as string, before.end_date as string) : null,
  });
  refreshAgentViews();
}

// hours = null (or empty) clears the cell; 0 is a real "0 hours".
export async function setHours(weekId: string, agentId: string, hours: number | null) {
  const me = await admin();
  let h: number | null = null;
  if (hours !== null) {
    if (!Number.isFinite(hours) || hours < 0 || hours > 999) throw new Error("Hours must be between 0 and 999");
    h = Math.round(hours * 100) / 100;
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("hour_assignments")
    .select("hours")
    .eq("week_id", weekId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const old = before ? Number(before.hours) : null;
  if (old === h) return;

  if (h === null) {
    const { error } = await supabase.from("hour_assignments").delete().eq("week_id", weekId).eq("agent_id", agentId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("hour_assignments")
      .upsert(
        { week_id: weekId, agent_id: agentId, hours: h, updated_by: me.id, updated_at: new Date().toISOString() },
        { onConflict: "week_id,agent_id" }
      );
    if (error) throw new Error(error.message);
  }

  const { data: wk } = await supabase.from("hour_weeks").select("project_id, start_date, end_date").eq("id", weekId).maybeSingle();
  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId: (wk?.project_id as string | undefined) ?? null,
    field: "hours_assigned",
    oldValue: old === null ? null : String(old),
    newValue: h === null ? "cleared" : String(h),
  });
  refreshAgentViews();
}

// colour = null removes it.
export async function setColour(weekId: string, agentId: string, colour: string | null) {
  await admin();
  const supabase = await createClient();
  if (colour === null) {
    const { error } = await supabase.from("hour_colours").delete().eq("week_id", weekId).eq("agent_id", agentId);
    if (error) throw new Error(error.message);
    return;
  }
  if (!HOUR_COLOURS.some((c) => c.key === colour)) throw new Error("Unknown colour");
  const { error } = await supabase
    .from("hour_colours")
    .upsert({ week_id: weekId, agent_id: agentId, colour }, { onConflict: "week_id,agent_id" });
  if (error) throw new Error(error.message);
}

// Agent: acknowledge the "hours changed" flag. Pass the changed_at that was shown.
export async function markHoursSeen(changedAt: string | null) {
  const me = await getCurrentAgent();
  if (!me) return;
  const supabase = await createClient();
  await supabase.rpc("mark_hours_seen", { p_changed_at: changedAt });
  revalidatePath("/timesheet");
}

// ---------------------------------------------------------------------------
// Bulk edits (autofill) and lead bonuses
// ---------------------------------------------------------------------------

const MAX_BULK = 5000;
type Cell = { weekId: string; agentId: string };

function groupByWeek<T extends Cell>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) (m.get(it.weekId) ?? m.set(it.weekId, []).get(it.weekId)!).push(it);
  return m;
}

// Many hour cells at once. hours null = clear the cell.
export async function setHoursMany(items: (Cell & { hours: number | null })[], label: string) {
  const me = await admin();
  if (items.length === 0) return;
  if (items.length > MAX_BULK) throw new Error("Too many cells at once");
  const supabase = await createClient();
  const sets: { week_id: string; agent_id: string; hours: number; updated_by: string; updated_at: string }[] = [];
  const clears: (Cell & { hours: null })[] = [];
  for (const it of items) {
    if (it.hours === null) {
      clears.push(it as Cell & { hours: null });
      continue;
    }
    if (!Number.isFinite(it.hours) || it.hours < 0 || it.hours > 999) throw new Error("Hours must be between 0 and 999");
    sets.push({
      week_id: it.weekId,
      agent_id: it.agentId,
      hours: Math.round(it.hours * 100) / 100,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    });
  }
  if (sets.length) {
    const { error } = await supabase.from("hour_assignments").upsert(sets, { onConflict: "week_id,agent_id" });
    if (error) throw new Error(error.message);
  }
  for (const [weekId, group] of groupByWeek(clears)) {
    const { error } = await supabase
      .from("hour_assignments")
      .delete()
      .eq("week_id", weekId)
      .in("agent_id", group.map((g) => g.agentId));
    if (error) throw new Error(error.message);
  }
  await logAudit(supabase, { actorId: me.id, field: "hours_autofill", newValue: `${label}: ${items.length} cell(s)` });
  refreshAgentViews();
}

// One bonus-per-lead cell. Only positive amounts are stored; 0 or null clears it.
export async function setBonus(weekId: string, agentId: string, amount: number | null) {
  const me = await admin();
  let a: number | null = null;
  if (amount !== null && amount !== 0) {
    if (!Number.isFinite(amount) || amount < 0 || amount > 999999) throw new Error("Bonus must be a positive amount");
    a = Math.round(amount * 100) / 100;
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("lead_bonus_rates")
    .select("amount")
    .eq("week_id", weekId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const old = before ? Number(before.amount) : null;
  if (old === a) return;

  if (a === null) {
    const { error } = await supabase.from("lead_bonus_rates").delete().eq("week_id", weekId).eq("agent_id", agentId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("lead_bonus_rates")
      .upsert(
        { week_id: weekId, agent_id: agentId, amount: a, updated_by: me.id, updated_at: new Date().toISOString() },
        { onConflict: "week_id,agent_id" }
      );
    if (error) throw new Error(error.message);
  }
  const { data: wk } = await supabase.from("hour_weeks").select("project_id").eq("id", weekId).maybeSingle();
  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId: (wk?.project_id as string | undefined) ?? null,
    field: "lead_bonus_set",
    oldValue: old === null ? null : String(old),
    newValue: a === null ? "cleared" : String(a),
  });
  revalidatePath("/assigned-hours");
}

export async function setBonusMany(items: (Cell & { amount: number | null })[], label: string) {
  const me = await admin();
  if (items.length === 0) return;
  if (items.length > MAX_BULK) throw new Error("Too many cells at once");
  const supabase = await createClient();
  const sets: { week_id: string; agent_id: string; amount: number; updated_by: string; updated_at: string }[] = [];
  const clears: Cell[] = [];
  for (const it of items) {
    if (it.amount === null || it.amount === 0) {
      clears.push(it);
      continue;
    }
    if (!Number.isFinite(it.amount) || it.amount < 0 || it.amount > 999999) throw new Error("Bonus must be a positive amount");
    sets.push({
      week_id: it.weekId,
      agent_id: it.agentId,
      amount: Math.round(it.amount * 100) / 100,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    });
  }
  if (sets.length) {
    const { error } = await supabase.from("lead_bonus_rates").upsert(sets, { onConflict: "week_id,agent_id" });
    if (error) throw new Error(error.message);
  }
  for (const [weekId, group] of groupByWeek(clears)) {
    const { error } = await supabase
      .from("lead_bonus_rates")
      .delete()
      .eq("week_id", weekId)
      .in("agent_id", group.map((g) => g.agentId));
    if (error) throw new Error(error.message);
  }
  await logAudit(supabase, { actorId: me.id, field: "lead_bonus_autofill", newValue: `${label}: ${items.length} cell(s)` });
  revalidatePath("/assigned-hours");
}

// Currency for a campaign's lead bonuses. A label change only: nothing is converted.
export async function setBonusCurrency(projectId: string, currency: string) {
  const me = await admin();
  if (!COMMON_CURRENCIES.includes(currency)) throw new Error("Unsupported currency");
  const supabase = await createClient();
  const { data: before } = await supabase.from("lead_bonus_settings").select("currency").eq("project_id", projectId).maybeSingle();
  const { error } = await supabase
    .from("lead_bonus_settings")
    .upsert({ project_id: projectId, currency, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    projectId,
    field: "lead_bonus_currency",
    oldValue: (before?.currency as string | undefined) ?? null,
    newValue: currency,
  });
  revalidatePath("/assigned-hours");
}
