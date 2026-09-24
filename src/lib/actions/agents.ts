"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
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

export async function updateAgentViewWindow(agentId: string, startSlot: number, endSlot: number) {
  const me = await requireAdmin();
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
