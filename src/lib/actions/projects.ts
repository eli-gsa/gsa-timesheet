"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { logAudit } from "@/lib/audit";

export async function addProject(name: string, color: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({ name, color });
  if (error) throw new Error(error.message);
  await logAudit(supabase, { actorId: me.id, field: "project_added", newValue: name });
  revalidatePath("/projects");
}

export async function updateProject(projectId: string, name: string, color: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ name, color }).eq("id", projectId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, { actorId: me.id, projectId, field: "project_updated", newValue: name });
  revalidatePath("/projects");
  revalidatePath("/timesheet");
}

export async function setProjectActive(projectId: string, active: boolean) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ active }).eq("id", projectId);
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    projectId,
    field: "project_active",
    newValue: String(active),
  });
  revalidatePath("/projects");
}

export async function setProjectAssignment(projectId: string, agentId: string, assigned: boolean) {
  const me = await requireAdmin();
  const supabase = await createClient();

  if (assigned) {
    const { error } = await supabase
      .from("project_agents")
      .upsert({ project_id: projectId, agent_id: agentId }, { onConflict: "project_id,agent_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("project_agents")
      .delete()
      .eq("project_id", projectId)
      .eq("agent_id", agentId);
    if (error) throw new Error(error.message);
  }

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId,
    field: "project_assignment",
    newValue: assigned ? "assigned" : "unassigned",
  });

  revalidatePath("/projects");
  revalidatePath("/timesheet");
}

// Admin-only: the total hours an agent is allocated on a project (drives the
// countdown on their timesheet). null clears it. Editable at any time, e.g.
// when a campaign's allocation changes mid-flight; every change is audited.
export async function setProjectAllocation(projectId: string, agentId: string, hours: number | null) {
  const me = await requireAdmin();
  if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 100000)) {
    throw new Error("Allocation must be a number of hours, 0 or more.");
  }
  const rounded = hours === null ? null : Math.round(hours * 100) / 100;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_agents")
    .select("allocated_hours")
    .eq("project_id", projectId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!existing) throw new Error("Assign the agent to this project first.");

  const { error } = await supabase
    .from("project_agents")
    .update({ allocated_hours: rounded })
    .eq("project_id", projectId)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    actorId: me.id,
    agentId,
    projectId,
    field: "project_allocation",
    oldValue: existing.allocated_hours === null ? "(none)" : `${existing.allocated_hours}h`,
    newValue: rounded === null ? "(none)" : `${rounded}h`,
  });

  revalidatePath("/projects");
  revalidatePath("/timesheet");
}

// Hard delete: permanently removes the project and, via ON DELETE CASCADE,
// its agent assignments, timesheet entries, and leads. The audit trail is
// preserved (audit_log.project_id is ON DELETE SET NULL) - the audit entry
// is written *before* the delete for the same reason as deleteAgent().
export async function deleteProject(projectId: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();

  await logAudit(supabase, {
    actorId: me.id,
    projectId,
    field: "project_deleted",
    oldValue: project?.name ?? projectId,
    newValue: "Deleted permanently",
  });

  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  revalidatePath("/timesheet");
  revalidatePath("/reports");
  revalidatePath("/");
}
