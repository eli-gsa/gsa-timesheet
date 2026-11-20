import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { loadAssignData } from "@/lib/hoursData";
import AssignHoursClient from "./AssignHoursClient";

export default async function AssignHoursPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: projects }, { data: agents }, data] = await Promise.all([
    supabase.from("projects").select("id, name, color, active").order("name"),
    supabase.from("agents").select("id, name, active").order("name"),
    loadAssignData(supabase),
  ]);
  return (
    <AssignHoursClient
      projects={(projects ?? []) as { id: string; name: string; color: string; active: boolean }[]}
      agents={(agents ?? []) as { id: string; name: string; active: boolean }[]}
      initial={data}
    />
  );
}
