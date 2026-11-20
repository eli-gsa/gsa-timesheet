import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import { fetchAll } from "@/lib/aggregates";
import { fmtHrs, fmtRange, halfToHours, type HourWeek } from "@/lib/hours";
import { loggedPerWeek } from "@/lib/hoursData";
import { todayIn, UK_ZONE } from "@/lib/timezones";
import MarkSeen from "./MarkSeen";

// The agent's own assigned hours, per campaign and week. Privacy: every query
// filters on the signed-in agent's id (taken from the session, never the URL),
// and the database's row-level security only ever returns an agent their own
// hour_assignments rows anyway.
export default async function AssignedHoursPage() {
  const me = await requireAgent();
  const supabase = await createClient();

  const [{ data: flag }, { data: pa }, { data: projects }, mine, loggedRows] = await Promise.all([
    supabase.from("hours_flags").select("changed_at, seen_at").eq("agent_id", me.id).maybeSingle(),
    supabase.from("project_agents").select("project_id").eq("agent_id", me.id),
    supabase.from("projects").select("id, name, color, active").order("name"),
    fetchAll<{ week_id: string; hours: number }>(
      (f, t) =>
        supabase
          .from("hour_assignments")
          .select("week_id, hours")
          .eq("agent_id", me.id)
          .order("week_id")
          .range(f, t) as never
    ),
    loggedPerWeek(supabase, me.id),
  ]);
  const weeks = await fetchAll<HourWeek>(
    (f, t) =>
      supabase.from("hour_weeks").select("id, project_id, start_date, end_date").order("start_date").order("id").range(f, t) as never
  );

  const hoursOf = new Map(mine.map((m) => [m.week_id, Number(m.hours)]));
  const loggedOf = new Map(loggedRows.filter((l) => l.agent_id === me.id).map((l) => [l.week_id, halfToHours(l.half_hours)]));
  const today = todayIn(UK_ZONE);
  const assignedIds = new Set((pa ?? []).map((r) => r.project_id as string));
  const weeksBy = new Map<string, HourWeek[]>();
  for (const w of weeks) (weeksBy.get(w.project_id) ?? weeksBy.set(w.project_id, []).get(w.project_id)!).push(w);

  const campaigns = ((projects ?? []) as { id: string; name: string; color: string; active: boolean }[]).filter(
    (p) => (assignedIds.has(p.id) && p.active) || (weeksBy.get(p.id) ?? []).some((w) => hoursOf.has(w.id))
  );

  return (
    <div className="max-w-[1100px]">
      <MarkSeen changedAt={flag && !flag.seen_at ? (flag.changed_at as string) : null} />
      <h2 className="text-lg font-semibold tracking-tight mb-1">Assigned Hours</h2>
      <p className="text-[13px] text-[#898781] mb-4">Your hours for each campaign you&apos;re assigned to, week by week.</p>

      {campaigns.length === 0 && <p className="text-sm text-[#898781]">You have no assigned campaigns yet.</p>}
      <div className="flex flex-col gap-4">
        {campaigns.map((p) => {
          const ws = weeksBy.get(p.id) ?? [];
          const total = ws.reduce((s, w) => s + (hoursOf.get(w.id) ?? 0), 0);
          const totalLogged = ws.reduce((s, w) => s + (loggedOf.get(w.id) ?? 0), 0);
          return (
            <section key={p.id} className="rounded-lg border border-[#e1e0d9] bg-white">
              <header className="flex items-center gap-2 px-3 py-2 border-b border-[#e1e0d9]">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                <h3 className="text-[14px] font-semibold mr-auto">{p.name}</h3>
              </header>
              <div className="p-3 overflow-x-auto">
                {ws.length === 0 ? (
                  <p className="text-[13px] text-[#898781]">No weeks have been set up for this campaign yet.</p>
                ) : (
                  <table className="text-[13px] border-separate border-spacing-0 min-w-full">
                    <thead>
                      <tr>
                        <th className="text-left font-semibold px-2 py-1.5 border-b border-[#e1e0d9] min-w-[140px]">Agent</th>
                        {ws.map((w) => (
                          <th
                            key={w.id}
                            className={`px-2 py-1.5 border-b border-[#e1e0d9] text-[12px] font-semibold min-w-[120px] ${
                              w.start_date <= today && today <= w.end_date ? "bg-[#e8f0fb] text-[#2a78d6]" : ""
                            }`}
                          >
                            {fmtRange(w.start_date, w.end_date)}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 border-b border-[#e1e0d9] text-right min-w-[70px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1.5">{me.name}</td>
                        {ws.map((w) => (
                          <td key={w.id} className="px-2 py-1.5 text-center tabular-nums">
                            {hoursOf.has(w.id) ? fmtHrs(hoursOf.get(w.id)!) : "–"}
                            <div className="text-[11px] text-[#898781]">logged {fmtHrs(loggedOf.get(w.id) ?? 0)}</div>
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                          {fmtHrs(total)}
                          <div className="text-[11px] font-normal text-[#898781]">logged {fmtHrs(totalLogged)}</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
