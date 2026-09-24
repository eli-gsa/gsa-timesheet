"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { logAudit } from "@/lib/audit";

export async function addLead(
  agentId: string,
  projectId: string,
  period: string,
  name: string,
  type: string
) {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");
  if (me.id !== agentId && me.role !== "admin") throw new Error("Not allowed");

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .insert({ agent_id: agentId, project_id: projectId, period, name, type });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId,
    field: "lead_added",
    newValue: name || "(unnamed lead)",
  });

  revalidatePath("/timesheet");
}

export async function updateLead(leadId: string, name: string, type: string) {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!existing) throw new Error("Lead not found");
  if (me.id !== existing.agent_id && me.role !== "admin") throw new Error("Not allowed");

  const { error } = await supabase
    .from("leads")
    .update({ name, type, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId: existing.agent_id,
    projectId: existing.project_id,
    field: "lead_updated",
    oldValue: existing.name,
    newValue: name,
  });

  revalidatePath("/timesheet");
}

export async function deleteLead(leadId: string) {
  const me = await getCurrentAgent();
  if (!me) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (!existing) return;
  if (me.id !== existing.agent_id && me.role !== "admin") throw new Error("Not allowed");

  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId: existing.agent_id,
    projectId: existing.project_id,
    field: "lead_removed",
    oldValue: existing.name,
  });

  revalidatePath("/timesheet");
}
