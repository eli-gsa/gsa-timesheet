import type { SupabaseClient } from "@supabase/supabase-js";

// Insert one audit_log row. Call from server actions after a mutation
// succeeds. `actorId` is whoever is signed in and performing the action
// (may differ from `agentId`, e.g. an admin editing someone else's hours).
export async function logAudit(
  supabase: SupabaseClient,
  entry: {
    actorId: string;
    agentId?: string | null;
    projectId?: string | null;
    entryDate?: string | null;
    field: string;
    oldValue?: string | null;
    newValue?: string | null;
  }
) {
  await supabase.from("audit_log").insert({
    actor_id: entry.actorId,
    agent_id: entry.agentId ?? null,
    project_id: entry.projectId ?? null,
    entry_date: entry.entryDate ?? null,
    field: entry.field,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
}
