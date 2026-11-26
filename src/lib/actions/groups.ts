"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { logAudit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(name: string, projectIds: string[]) {
  const n = name.trim();
  if (n.length < 1 || n.length > 80) throw new Error("Group name must be 1-80 characters");
  const ids = Array.from(new Set(projectIds));
  if (ids.length > 500 || !ids.every((i) => UUID.test(i))) throw new Error("Invalid campaigns");
  return { n, ids };
}

function friendly(message: string, code?: string) {
  if (code === "23505") return "A group with that name already exists";
  if (code === "42P01") return "Run migration 0015 in Supabase first (campaign groups tables are missing)";
  return message;
}

// A group is just a named set of campaigns, used to combine them in Reports.
// Nothing about the campaigns themselves changes.
export async function createGroup(name: string, projectIds: string[]) {
  const me = await requireAdmin();
  const { n, ids } = clean(name, projectIds);
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_groups").insert({ name: n }).select("id").single();
  if (error) throw new Error(friendly(error.message, error.code));
  if (ids.length) {
    const { error: e2 } = await supabase.from("project_group_members").insert(ids.map((p) => ({ group_id: data.id, project_id: p })));
    if (e2) throw new Error(friendly(e2.message, e2.code));
  }
  await logAudit(supabase, { actorId: me.id, field: "group_added", newValue: `${n}: ${ids.length} campaign(s)` });
  revalidatePath("/projects");
  revalidatePath("/reports");
}

export async function updateGroup(groupId: string, name: string, projectIds: string[]) {
  const me = await requireAdmin();
  if (!UUID.test(groupId)) throw new Error("Invalid group");
  const { n, ids } = clean(name, projectIds);
  const supabase = await createClient();
  const { error } = await supabase.from("project_groups").update({ name: n }).eq("id", groupId);
  if (error) throw new Error(friendly(error.message, error.code));

  const { data: cur, error: e1 } = await supabase.from("project_group_members").select("project_id").eq("group_id", groupId);
  if (e1) throw new Error(friendly(e1.message, e1.code));
  const have = new Set((cur ?? []).map((r) => r.project_id as string));
  const want = new Set(ids);
  const add = ids.filter((i) => !have.has(i));
  const drop = Array.from(have).filter((i) => !want.has(i));
  if (add.length) {
    const { error: e2 } = await supabase.from("project_group_members").insert(add.map((p) => ({ group_id: groupId, project_id: p })));
    if (e2) throw new Error(friendly(e2.message, e2.code));
  }
  if (drop.length) {
    const { error: e3 } = await supabase.from("project_group_members").delete().eq("group_id", groupId).in("project_id", drop);
    if (e3) throw new Error(friendly(e3.message, e3.code));
  }
  await logAudit(supabase, { actorId: me.id, field: "group_updated", newValue: `${n}: ${ids.length} campaign(s)` });
  revalidatePath("/projects");
  revalidatePath("/reports");
}

export async function deleteGroup(groupId: string) {
  const me = await requireAdmin();
  if (!UUID.test(groupId)) throw new Error("Invalid group");
  const supabase = await createClient();
  const { data: g } = await supabase.from("project_groups").select("name").eq("id", groupId).maybeSingle();
  const { error } = await supabase.from("project_groups").delete().eq("id", groupId);
  if (error) throw new Error(friendly(error.message, error.code));
  await logAudit(supabase, { actorId: me.id, field: "group_deleted", oldValue: (g?.name as string | undefined) ?? null });
  revalidatePath("/projects");
  revalidatePath("/reports");
}
