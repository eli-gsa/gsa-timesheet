"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireAgent } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/lib/types";

export async function updateAgentRole(agentId: string, role: Role) {
  const me = await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("agents").select("role, name").eq("id", agentId).maybeSingle();
  const { error } = await supabase.from("agents").update({ role }).eq("id", agentId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "role",
    oldValue: existing?.role ?? null,
    newValue: role,
  });

  revalidatePath("/team");
}

export async function setAgentActive(agentId: string, active: boolean) {
  const me = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("agents").update({ active }).eq("id", agentId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "active",
    newValue: String(active),
  });

  revalidatePath("/team");
}

// Self-service: an agent can set their own view window from the Timesheet
// page; an admin can set anyone's. RLS ("agents: self or admin can update")
// enforces this too - the check here just gives a clean error instead of a
// raw Postgres permission failure.
export async function updateAgentViewWindow(agentId: string, startSlot: number, endSlot: number) {
  const me = await requireAgent();
  if (me.id !== agentId && me.role !== "admin") {
    throw new Error("Not authorized to edit this agent's view window.");
  }
  const supabase = await createClient();

  if (startSlot < 0 || endSlot > 48 || startSlot >= endSlot) {
    throw new Error("Invalid view window");
  }

  const { error } = await supabase
    .from("agents")
    .update({ view_start_slot: startSlot, view_end_slot: endSlot })
    .eq("id", agentId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "view_window",
    newValue: `${startSlot}-${endSlot}`,
  });

  revalidatePath("/team");
  revalidatePath("/timesheet");
}

// Hard delete: permanently removes the agent and, via ON DELETE CASCADE,
// their project assignments, timesheet entries, and leads. The audit trail
// is preserved (audit_log.agent_id is ON DELETE SET NULL), which is why the
// audit entry below is written *before* the delete - it still references
// agentId at that point, and the FK cascade nulls it out once the agent row
// is gone, matching the prototype's "Delete" behaviour exactly.
//
// Caveat: this deletes the public.agents row only, not the underlying
// Supabase Auth user (agents.id references auth.users, not the other way
// round) - deleting Auth users requires a service-role key this app doesn't
// hold. In the unlikely case that person signs in again, they'll need an
// admin to re-provision them (their old auth session, if any, would 404 in
// a login loop rather than silently recreate their old agent row).
export async function deleteAgent(agentId: string) {
  const me = await requireAdmin();
  if (agentId === me.id) {
    throw new Error("You can't delete the agent you're currently signed in as.");
  }
  const supabase = await createClient();
  const { data: agent } = await supabase.from("agents").select("name").eq("id", agentId).maybeSingle();

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    field: "agent_deleted",
    oldValue: agent?.name ?? agentId,
    newValue: "Deleted permanently",
  });

  const { error } = await supabase.from("agents").delete().eq("id", agentId);
  if (error) throw new Error(error.message);

  revalidatePath("/team");
  revalidatePath("/timesheet");
  revalidatePath("/projects");
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function addAdminEmail(email: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("admin_emails").insert({ email: email.toLowerCase().trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function removeAdminEmail(email: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("admin_emails").delete().eq("email", email);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function addAllowedDomain(domain: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("allowed_domains")
    .insert({ domain: domain.toLowerCase().trim() });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function removeAllowedDomain(domain: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("allowed_domains").delete().eq("domain", domain);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
