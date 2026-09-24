"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import type { StandardWorkDay } from "@/lib/types";

export async function addLeadType(name: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_types").insert({ name: name.trim() });
  if (error) throw new Error(error.message);
  await logAudit(supabase, { actorId: me.id, field: "lead_type_added", newValue: name.trim() });
  revalidatePath("/settings");
}

export async function removeLeadType(id: string, name: string) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logAudit(supabase, { actorId: me.id, field: "lead_type_removed", oldValue: name });
  revalidatePath("/settings");
}

export async function updateStandardWorkDay(value: StandardWorkDay) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "standard_work_day", value }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await logAudit(supabase, {
    actorId: me.id,
    field: "standard_work_day",
    newValue: `${value.startSlot}-${value.endSlot}`,
  });
  revalidatePath("/settings");
}
