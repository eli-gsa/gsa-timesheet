import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import { fetchAll } from "@/lib/aggregates";
import { fmtHrs, fmtRange, halfToHours, type HourWeek } from "@/lib/hours";
import { loggedPerWeek } from "@/lib/hoursData";
import { todayIn, UK_ZONE } from "@/lib/timezones";
import { addMonthsYm, formatNumber, isMonth, monthLabelLong } from "@/lib/invoicing";
import Link from "next/link";
import MarkSeen from "./MarkSeen";

type BonusRow = {
  lead_id: string;
  project_id: string;
  lead_type: string | null;
  lead_name: string | null;
  lead_date: string;
  amount: number;
  currency: string;
};

// The agent's own assigned hours, per campaign and week. Privacy: every query
// filters on the signed-in agent's id (taken from the session, never the URL),
// and the database's row-level security only ever returns an agent their own
// hour_assignments rows anyway.
export default async function AssignedHoursPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireAgent();
  const sp = await searchParams;
  const nowMonth = todayIn(UK_ZONE).slice(0, 7);
  const month = isMonth(sp.month) ? sp.month : nowMonth;
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

  // Lead bonuses for the chosen month (migration 0015). Only leads that earn a
  // positive bonus come back; if the SQL isn't installed yet this is just empty.
  let bonusRows: BonusRow[] = [];
  try {
    const { data, error } = await supabase.rpc("lead_bonus_rows", { p_agent: me.id, p_month: month });
    if (!error) bonusRows = ((data ?? []) as BonusRow[]).map((r) => ({ ...r, amount: Number(r.amount) })).filter((r) => r.amount > 0);
  } catch {
    /* not installed yet */
  }
  const nameOfProject = new Map(((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  bonusRows.sort(
    (a, b) =>
      (nameOfProject.get(a.project_id) ?? "").localeCompare(nameOfProject.get(b.project_id) ?? "") ||
      a.lead_date.localeCompare(b.lead_date) ||
      (a.lead_name ?? "").localeCompare(b.lead_name ?? "")
  );
  const totals = new Map<string, number>();
  for (const r of bonusRows) totals.set(r.currency, Math.round(((totals.get(r.currency) ?? 0) + r.amount) * 100) / 100);

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
      <h2 className="text-lg font-semibold tracking-tight mb-1">Schedule and Lead Summary</h2>
      <p className="text-[13px] text-[#898781] mb-1">Your hours for each campaign you&apos;re assigned to, week by week.</p>
      <p className="text-[12.5px] text-[#52514e] mb-4">These numbers are subject to change - please review daily to stay up to date</p>

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

      {bonusRows.length > 0 && (
        <section className="mt-6 rounded-lg border border-[#e1e0d9] bg-white">
          <header className="flex items-center gap-2 px-3 py-2 border-b border-[#e1e0d9]">
            <h3 className="text-[14px] font-semibold mr-auto">Lead bonuses</h3>
            <Link
              href={`/assigned-hours?month=${addMonthsYm(month, -1)}`}
              className="rounded-md border border-[#c3c2b7] px-2 py-0.5 text-[12.5px] hover:bg-[#f3f2ee]"
              aria-label="Previous month"
            >
              ‹
            </Link>
            <span className="text-[13px] font-medium min-w-[110px] text-center">{monthLabelLong(month)}</span>
            <Link
              href={`/assigned-hours?month=${addMonthsYm(month, 1)}`}
              className="rounded-md border border-[#c3c2b7] px-2 py-0.5 text-[12.5px] hover:bg-[#f3f2ee]"
              aria-label="Next month"
            >
              ›
            </Link>
          </header>
          <div className="p-3 overflow-x-auto">
            <table className="text-[13px] border-separate border-spacing-0 min-w-full">
              <thead>
                <tr>
                  <th className="text-left font-semibold px-2 py-1.5 border-b border-[#e1e0d9]">Campaign</th>
                  <th className="text-left font-semibold px-2 py-1.5 border-b border-[#e1e0d9]">Lead type</th>
                  <th className="text-left font-semibold px-2 py-1.5 border-b border-[#e1e0d9]">Name</th>
                  <th className="text-right font-semibold px-2 py-1.5 border-b border-[#e1e0d9]">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {bonusRows.map((r) => (
                  <tr key={r.lead_id}>
                    <td className="px-2 py-1.5 border-b border-[#f0efe9]">{nameOfProject.get(r.project_id) ?? "–"}</td>
                    <td className="px-2 py-1.5 border-b border-[#f0efe9]">{r.lead_type || "–"}</td>
                    <td className="px-2 py-1.5 border-b border-[#f0efe9]">{r.lead_name || "–"}</td>
                    <td className="px-2 py-1.5 border-b border-[#f0efe9] text-right tabular-nums">
                      {r.currency} {formatNumber(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {Array.from(totals).map(([cur, t], i) => (
                  <tr key={cur} className="font-semibold">
                    <td className="px-2 py-1.5" colSpan={3}>
                      {i === 0 ? "Total bonus" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {cur} {formatNumber(t)}
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
