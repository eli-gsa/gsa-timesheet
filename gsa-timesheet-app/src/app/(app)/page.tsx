import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { fmtHours } from "@/lib/types";

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function OverviewPage() {
  const me = await getCurrentAgent();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/timesheet");

  const supabase = await createClient();
  const month = currentYm();
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;

  const [{ count: agentCount }, { count: projectCount }, { data: entries }, { data: projects }] =
    await Promise.all([
      supabase.from("agents").select("*", { count: "exact", head: true }).eq("active", true),
      supabase.from("projects").select("*", { count: "exact", head: true }).eq("active", true),
      supabase
        .from("timesheet_entries")
        .select("project_id")
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd),
      supabase.from("projects").select("*").eq("active", true).order("name"),
    ]);

  const totalHours = (entries?.length ?? 0) * 0.5;

  const byProject = new Map<string, number>();
  for (const e of entries ?? []) {
    byProject.set(e.project_id, (byProject.get(e.project_id) ?? 0) + 0.5);
  }
  const maxHours = Math.max(0.0001, ...Array.from(byProject.values()));

  return (
    <div>
      <h2 className="text-[19px] font-semibold mb-4">Overview</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
        <Stat label="Active agents" value={String(agentCount ?? 0)} />
        <Stat label="Active projects" value={String(projectCount ?? 0)} />
        <Stat label="Hours this month" value={fmtHours(totalHours)} />
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
        <h3 className="text-[13.5px] font-semibold mb-3">Hours by project this month</h3>
        <div className="flex flex-col gap-2">
          {(projects ?? []).map((p) => {
            const hours = byProject.get(p.id) ?? 0;
            return (
              <div key={p.id} className="flex items-center gap-2.5">
                <span className="w-28 shrink-0 text-[12.5px] text-[#52514e] truncate">{p.name}</span>
                <div className="flex-1 h-4 bg-[#f3f2ee] rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(hours / maxHours) * 100}%`, background: p.color }}
                  />
                </div>
                <span className="w-14 text-right text-[12px] tabular-nums text-[#898781]">
                  {fmtHours(hours)}h
                </span>
              </div>
            );
          })}
          {(projects ?? []).length === 0 && (
            <p className="text-[12.5px] text-[#898781]">No active projects yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg px-3.5 py-3">
      <div className="text-[11.5px] text-[#898781]">{label}</div>
      <div className="text-[24px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
