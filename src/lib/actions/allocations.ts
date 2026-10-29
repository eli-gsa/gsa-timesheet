"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { todayIn } from "@/lib/timezones";
import { mapStatusRows, type AllocKind, type AllocStatus } from "@/lib/allocation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkIds(...ids: string[]) {
  for (const id of ids) if (!UUID.test(id)) throw new Error("Invalid request");
}
function optDate(d: string | null | undefined): string | null {
  if (d === null || d === undefined || d === "") return null;
  if (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new Error("Invalid date");
  return d;
}
function hoursValue(h: number, opts: { allowNegative?: boolean } = {}): number {
  if (!Number.isFinite(h) || Math.abs(h) > 100000) throw new Error("Hours must be a number");
  if (!opts.allowNegative && h < 0) throw new Error("Hours must be 0 or more");
  return Math.round(h * 100) / 100;
}
function noteValue(n: string | null | undefined): string | null {
  const t = (n ?? "").trim();
  return t ? t.slice(0, 200) : null;
}
function checkWindow(start: string | null, end: string | null) {
  if (start && end && start > end) throw new Error("The end date can't be before the start date.");
}

export type LedgerEntry = { id: string; allocationId: string; hours: number; entryDate: string; note: string | null };
export type AllocationDetail = {
  today: string;
  allocations: AllocStatus[]; // open first, then closed (newest first)
  entries: LedgerEntry[];
};

async function agentToday(supabase: Awaited<ReturnType<typeof createClient>>, agentId: string) {
  const { data } = await supabase.from("agents").select("timezone").eq("id", agentId).maybeSingle();
  return todayIn((data?.timezone as string | null) ?? null);
}

// Everything the admin's allocation manager shows for one agent + project.
export async function getAllocationDetail(projectId: string, agentId: string): Promise<AllocationDetail> {
  await requireAdmin();
  checkIds(projectId, agentId);
  const supabase = await createClient();
  const today = await agentToday(supabase, agentId);

  const { data: rows, error } = await supabase.rpc("allocation_status", {
    p_agent: agentId,
    p_today: today,
    p_include_closed: true,
  });
  if (error) throw new Error(error.message);
  const all = mapStatusRows(rows).filter((a) => a.projectId === projectId);
  all.sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt) || (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));

  const campaignIds = all.filter((a) => a.kind === "campaign").map((a) => a.allocationId);
  let entries: LedgerEntry[] = [];
  if (campaignIds.length > 0) {
    const { data: ent, error: e2 } = await supabase
      .from("allocation_entries")
      .select("id, allocation_id, hours, entry_date, note")
      .in("allocation_id", campaignIds)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (e2) throw new Error(e2.message);
    entries = (ent ?? []).map((r) => ({
      id: r.id as string,
      allocationId: r.allocation_id as string,
      hours: Number(r.hours),
      entryDate: r.entry_date as string,
      note: (r.note as string | null) ?? null,
    }));
  }
  return { today, allocations: all, entries };
}

type NewAllocation = {
  projectId: string;
  agentId: string;
  kind: AllocKind;
  hours: number; // campaign: opening top-up (0 = none); weekly/monthly: the cap
  startDate?: string | null;
  endDate?: string | null;
  note?: string | null;
};

async function insertAllocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: { id: string },
  a: NewAllocation,
  today: string
) {
  const start = optDate(a.startDate);
  const end = optDate(a.endDate);
  checkWindow(start, end);
  const hours = hoursValue(a.hours);
  const note = noteValue(a.note);

  const { data, error } = await supabase
    .from("allocations")
    .insert({
      project_id: a.projectId,
      agent_id: a.agentId,
      kind: a.kind,
      period_hours: a.kind === "campaign" ? null : hours,
      start_date: a.kind === "campaign" ? start : null,
      end_date: a.kind === "campaign" ? end : null,
      note,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("This agent already has an open allocation of that type on this project. Close it first.");
    }
    throw new Error(error.message);
  }
  if (a.kind === "campaign" && hours !== 0) {
    const { error: e2 } = await supabase.from("allocation_entries").insert({
      allocation_id: data.id,
      hours,
      entry_date: start ?? today,
      note: note ?? "Opening allocation",
      created_by: me.id,
    });
    if (e2) throw new Error(e2.message);
  }
  await logAudit(supabase, {
    actorId: me.id,
    agentId: a.agentId,
    projectId: a.projectId,
    field: "allocation_created",
    newValue: `${a.kind} ${hours}h${start || end ? ` (${start ?? "…"} to ${end ?? "…"})` : ""}`,
  });
}

function refresh() {
  revalidatePath("/projects");
  revalidatePath("/timesheet");
}

export async function createAllocation(a: NewAllocation) {
  const me = await requireAdmin();
  checkIds(a.projectId, a.agentId);
  if (!["campaign", "weekly", "monthly"].includes(a.kind)) throw new Error("Invalid type");
  const supabase = await createClient();
  await insertAllocation(supabase, me, a, await agentToday(supabase, a.agentId));
  refresh();
}

async function loadOpenAllocation(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("allocations")
    .select("id, project_id, agent_id, kind, end_date, closed_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("Allocation not found");
  if (data.closed_at) throw new Error("This allocation is already closed.");
  return data as { id: string; project_id: string; agent_id: string; kind: AllocKind; end_date: string | null };
}

// A top-up (+) or correction (-) on a campaign allocation.
export async function addAllocationEntry(allocationId: string, hours: number, entryDate: string, note: string) {
  const me = await requireAdmin();
  checkIds(allocationId);
  const h = hoursValue(hours, { allowNegative: true });
  if (h === 0) throw new Error("Enter a non-zero number of hours.");
  const date = optDate(entryDate);
  if (!date) throw new Error("Pick a date");
  const supabase = await createClient();
  const al = await loadOpenAllocation(supabase, allocationId);
  if (al.kind !== "campaign") throw new Error("Only campaign allocations have top-ups.");

  const { error } = await supabase
    .from("allocation_entries")
    .insert({ allocation_id: allocationId, hours: h, entry_date: date, note: noteValue(note), created_by: me.id });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    agentId: al.agent_id,
    projectId: al.project_id,
    field: "allocation_topup",
    newValue: `${h > 0 ? "+" : ""}${h}h${note.trim() ? ` (${note.trim().slice(0, 80)})` : ""}`,
  });
  refresh();
}

export async function removeAllocationEntry(entryId: string) {
  const me = await requireAdmin();
  checkIds(entryId);
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("allocation_entries")
    .select("id, hours, allocation_id, allocations(agent_id, project_id, closed_at)")
    .eq("id", entryId)
    .maybeSingle();
  if (!e) throw new Error("Entry not found");
  const al = (Array.isArray(e.allocations) ? e.allocations[0] : e.allocations) as
    | { agent_id: string; project_id: string; closed_at: string | null }
    | null;
  if (al?.closed_at) throw new Error("This allocation is closed, so its history is locked.");

  const { error } = await supabase.from("allocation_entries").delete().eq("id", entryId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    agentId: al?.agent_id ?? null,
    projectId: al?.project_id ?? null,
    field: "allocation_entry_removed",
    oldValue: `${Number(e.hours)}h`,
  });
  refresh();
}

// Change the counting window of an open campaign allocation.
export async function updateAllocationWindow(allocationId: string, startDate: string | null, endDate: string | null) {
  const me = await requireAdmin();
  checkIds(allocationId);
  const start = optDate(startDate);
  const end = optDate(endDate);
  checkWindow(start, end);
  const supabase = await createClient();
  const al = await loadOpenAllocation(supabase, allocationId);
  if (al.kind !== "campaign") throw new Error("Only campaign allocations have a window.");

  const { error } = await supabase.from("allocations").update({ start_date: start, end_date: end }).eq("id", allocationId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    agentId: al.agent_id,
    projectId: al.project_id,
    field: "allocation_window",
    newValue: `${start ?? "…"} to ${end ?? "…"}`,
  });
  refresh();
}

// Finish an allocation (kept as a record), optionally starting a new one.
export async function closeAllocation(
  allocationId: string,
  closeDate: string,
  renew?: { hours: number; startDate?: string | null; endDate?: string | null; note?: string | null } | null
) {
  const me = await requireAdmin();
  checkIds(allocationId);
  const close = optDate(closeDate);
  if (!close) throw new Error("Pick a close date");
  const supabase = await createClient();
  const al = await loadOpenAllocation(supabase, allocationId);

  // A campaign's window ends no later than the day it's closed.
  const patch: { closed_at: string; end_date?: string } = { closed_at: new Date().toISOString() };
  if (al.kind === "campaign" && (!al.end_date || al.end_date > close)) patch.end_date = close;
  const { error } = await supabase.from("allocations").update(patch).eq("id", allocationId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    agentId: al.agent_id,
    projectId: al.project_id,
    field: "allocation_closed",
    newValue: `${al.kind} closed ${close}`,
  });

  if (renew && al.kind === "campaign") {
    await insertAllocation(
      supabase,
      me,
      { projectId: al.project_id, agentId: al.agent_id, kind: "campaign", ...renew },
      close
    );
  }
  refresh();
}

// Set (or clear, with null) the weekly/monthly cap for an agent on a project.
export async function setRecurringCap(projectId: string, agentId: string, kind: "weekly" | "monthly", hours: number | null) {
  const me = await requireAdmin();
  checkIds(projectId, agentId);
  if (kind !== "weekly" && kind !== "monthly") throw new Error("Invalid type");
  const supabase = await createClient();

  const { data: open } = await supabase
    .from("allocations")
    .select("id, period_hours")
    .eq("project_id", projectId)
    .eq("agent_id", agentId)
    .eq("kind", kind)
    .is("closed_at", null)
    .maybeSingle();

  if (hours === null) {
    if (open) {
      const { error } = await supabase.from("allocations").update({ closed_at: new Date().toISOString() }).eq("id", open.id);
      if (error) throw new Error(error.message);
      await logAudit(supabase, { actorId: me.id, agentId, projectId, field: "allocation_cap", oldValue: `${kind} ${Number(open.period_hours)}h`, newValue: "(removed)" });
    }
  } else {
    const h = hoursValue(hours);
    if (open) {
      const { error } = await supabase.from("allocations").update({ period_hours: h }).eq("id", open.id);
      if (error) throw new Error(error.message);
      await logAudit(supabase, { actorId: me.id, agentId, projectId, field: "allocation_cap", oldValue: `${kind} ${Number(open.period_hours)}h`, newValue: `${kind} ${h}h` });
    } else {
      await insertAllocation(supabase, me, { projectId, agentId, kind, hours: h }, todayIn(null));
    }
  }
  refresh();
}

export type BulkResult = {
  created: number;
  toppedUp: number;
  failed: { agentId: string; message: string }[];
};

// Give several agents hours on one project in one go. Agents with an open
// campaign allocation get a top-up entry (positive or negative); agents
// without one get a new campaign allocation with this as the opening hours
// (counting window as given; a negative amount can't open one).
export async function bulkAllocate(
  projectId: string,
  agentIds: string[],
  hours: number,
  entryDate: string,
  startDate: string | null,
  endDate: string | null,
  note: string
): Promise<BulkResult> {
  const me = await requireAdmin();
  checkIds(projectId, ...agentIds);
  const ids = Array.from(new Set(agentIds));
  if (ids.length === 0) throw new Error("Select at least one agent.");
  if (ids.length > 200) throw new Error("Too many agents at once.");
  const h = hoursValue(hours, { allowNegative: true });
  if (h === 0) throw new Error("Enter a non-zero number of hours.");
  const date = optDate(entryDate);
  if (!date) throw new Error("Pick a date");
  const start = optDate(startDate);
  const end = optDate(endDate);
  checkWindow(start, end);
  const noteText = noteValue(note);

  const supabase = await createClient();
  const { data: open, error } = await supabase
    .from("allocations")
    .select("id, agent_id")
    .eq("project_id", projectId)
    .eq("kind", "campaign")
    .is("closed_at", null)
    .in("agent_id", ids);
  if (error) throw new Error(error.message);
  const openByAgent = new Map((open ?? []).map((a) => [a.agent_id as string, a.id as string]));

  const result: BulkResult = { created: 0, toppedUp: 0, failed: [] };
  for (const agentId of ids) {
    try {
      const existing = openByAgent.get(agentId);
      if (existing) {
        const { error: e } = await supabase
          .from("allocation_entries")
          .insert({ allocation_id: existing, hours: h, entry_date: date, note: noteText, created_by: me.id });
        if (e) throw new Error(e.message);
        await logAudit(supabase, {
          actorId: me.id,
          agentId,
          projectId,
          field: "allocation_topup",
          newValue: `${h > 0 ? "+" : ""}${h}h (bulk)`,
        });
        result.toppedUp++;
      } else {
        if (h < 0) throw new Error("No open allocation to reduce.");
        await insertAllocation(
          supabase,
          me,
          { projectId, agentId, kind: "campaign", hours: h, startDate: start, endDate: end, note: noteText },
          date
        );
        result.created++;
      }
    } catch (e) {
      result.failed.push({ agentId, message: e instanceof Error ? e.message : "Failed" });
    }
  }
  refresh();
  return result;
}
