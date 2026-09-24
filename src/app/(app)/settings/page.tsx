import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { LeadType, StandardWorkDay } from "@/lib/types";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: leadTypes }, { data: workDaySetting }, { data: domains }, { data: adminEmails }] =
    await Promise.all([
      supabase.from("lead_types").select("*").order("name"),
      supabase.from("settings").select("*").eq("key", "standard_work_day").maybeSingle(),
      supabase.from("allowed_domains").select("*").order("domain"),
      supabase.from("admin_emails").select("*").order("email"),
    ]);

  const standardWorkDay: StandardWorkDay =
    (workDaySetting?.value as StandardWorkDay) ?? { startSlot: 16, endSlot: 34 };

  return (
    <SettingsClient
      leadTypes={(leadTypes as LeadType[]) ?? []}
      standardWorkDay={standardWorkDay}
      domains={(domains ?? []).map((d) => d.domain as string)}
      adminEmails={(adminEmails ?? []).map((a) => a.email as string)}
    />
  );
}
