import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAgent } from "@/lib/data";
import { todayIn } from "@/lib/timezones";
import { addMonthsYm, isMonth, monthLabelLong } from "@/lib/invoicing";
import { fmtHours } from "@/lib/types";

type Day = { entry_date: string; project_id: string; half_hours: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
// Date arithmetic on YYYY-MM-DD strings in UTC, so it never depends on the
// server's timezone.
function ymd(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(s: string, n: number) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function dayLabel(s: string) {
  return parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

// The agent's own breakdown of their hours: per project for the month, and
// week by week (Mon-Sun, clipped to the month so the weeks add up to the
// month total exactly). Own data only: the agent id comes from the session,
// never from the URL.
export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireAgent();
  const params = await searchParams;
  const today = todayIn(me.timezone);
  const month = isMonth(params.month) ? params.month : today.slice(0, 7);

  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;

  const supabase = await createClient();
  const [{ data: dayRows }, { data: projects }, { data: setting }] = await Promise.all([
    supabase.rpc("agent_daily_totals", { p_agent: me.id, p_start: monthStart, p_end: monthEnd }),
    supabase.from("projects").select("id, name, color"),
    supabase.from("settings").select("value").eq("key", "standard_work_day").maybeSingle(),
  ]);

  const win = (setting?.value as { startSlot: number; endSlot: number } | undefined) ?? { startSlot: 16, endSlot: 34 };
  const standardDayHours = Math.max(0.5, (win.endSlot - win.startSlot) * 0.5);

  const info = new Map<string, { name: string; color: string }>(
    ((projects ?? []) as { id: string; name: string; color: string }[]).map((p) => [p.id, { name: p.name, color: p.color }])
  );

  // Month totals per project, ordered by hours worked.
  const monthHH = new Map<string, number>();
  for (const r of (dayRows ?? []) as Day[]) monthHH.set(r.project_id, (monthHH.get(r.project_id) ?? 0) + Number(r.half_hours));
  const cols = [...monthHH.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, hh]) => ({ id, hh, name: info.get(id)?.name ?? "Unknown project", color: info.get(id)?.color ?? "#c3c2b7" }));
  const monthTotalHH = cols.reduce((s, c) => s + c.hh, 0);

  // Weeks overlapping the month, clipped to it.
  const weeks: { label: string; start: string; end: string }[] = [];
  const firstDow = parse(monthStart).getUTCDay(); // 0 = Sun
  let cursor = addDays(monthStart, firstDow === 0 ? -6 : 1 - firstDow); // Monday on/before the 1st
  while (cursor <= monthEnd) {
    const start = cursor < monthStart ? monthStart : cursor;
    const wkEnd = addDays(cursor, 6);
    const end = wkEnd > monthEnd ? monthEnd : wkEnd;
    weeks.push({ start, end, label: start === end ? dayLabel(start) : `${dayLabel(start)} – ${dayLabel(end)}` });
    cursor = addDays(cursor, 7);
  }
  const weekHH = (w: { start: string; end: string }, projectId: string) =>
    ((dayRows ?? []) as Day[])
      .filter((r) => r.project_id === projectId && r.entry_date >= w.start && r.entry_date <= w.end)
      .reduce((s, r) => s + Number(r.half_hours), 0);

  const nav = "rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee]";
  const th = "text-right px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium whitespace-nowrap";

  return (
    <div className="max-w-[900px]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[19px] font-semibold">My summary</h2>
          <p className="text-[12.5px] text-[#898781]">
            {monthLabelLong(month)} · <span className="tabular-nums">{fmtHours(monthTotalHH * 0.5)}h</span> worked
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <Link className={nav} href={`/summary?month=${addMonthsYm(month, -1)}`}>
            ←
          </Link>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1.5 text-[13px]"
          />
          <button className={nav} type="submit">
            Go
          </button>
          <Link className={nav} href={`/summary?month=${addMonthsYm(month, 1)}`}>
            →
          </Link>
          <Link className={nav} href="/summary">
            This month
          </Link>
        </form>
      </div>

      {cols.length === 0 ? (
        <p className="text-[13px] text-[#898781] border border-[#e1e0d9] rounded-lg p-6 text-center">
          No hours logged in {monthLabelLong(month)}.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <h3 className="text-[13.5px] font-semibold mb-1.5">By project</h3>
            <div className="border border-[#e1e0d9] rounded-lg overflow-hidden">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="bg-[#f3f2ee]">
                  <tr>
                    <th className="text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium">Project</th>
                    <th className={th}>Hours</th>
                    <th className={th}>Days (÷{standardDayHours}h)</th>
                  </tr>
                </thead>
                <tbody>
                  {cols.map((c) => (
                    <tr key={c.id} className="border-t border-[#e1e0d9]">
                      <td className="px-2.5 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      </td>
                      <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(c.hh * 0.5)}</td>
                      <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours((c.hh * 0.5) / standardDayHours)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[#e1e0d9] bg-[#f3f2ee] font-semibold">
                    <td className="px-2.5 py-1">Total</td>
                    <td className="px-2.5 py-1 text-right tabular-nums">{fmtHours(monthTotalHH * 0.5)}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums">
                      {fmtHours((monthTotalHH * 0.5) / standardDayHours)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-[13.5px] font-semibold mb-1.5">Week by week</h3>
            <div className="border border-[#e1e0d9] rounded-lg overflow-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="bg-[#f3f2ee]">
                  <tr>
                    <th className="text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium sticky left-0 bg-[#f3f2ee]">
                      Week
                    </th>
                    {cols.map((c) => (
                      <th key={c.id} className={th}>
                        <span className="inline-flex items-center gap-1.5 justify-end">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c.color }} />
                          {c.name}
                        </span>
                      </th>
                    ))}
                    <th className={`${th} border-l border-[#e1e0d9]`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => {
                    const vals = cols.map((c) => weekHH(w, c.id));
                    const tot = vals.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={w.start} className="border-t border-[#e1e0d9]">
                        <td className="px-2.5 py-1 whitespace-nowrap sticky left-0 bg-[#fcfcfb] border-r border-[#e1e0d9]">
                          {w.label}
                        </td>
                        {vals.map((v, i) => (
                          <td
                            key={cols[i].id}
                            className={`px-2.5 py-1 text-right tabular-nums ${v === 0 ? "bg-[#f3f2ee] text-[#c3c2b7]" : ""}`}
                          >
                            {fmtHours(v * 0.5)}
                          </td>
                        ))}
                        <td className={`px-2.5 py-1 text-right tabular-nums font-semibold border-l border-[#e1e0d9] ${tot === 0 ? "text-[#c3c2b7]" : ""}`}>
                          {fmtHours(tot * 0.5)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#c3c2b7] bg-[#f3f2ee] font-semibold">
                    <td className="px-2.5 py-1 sticky left-0 bg-[#f3f2ee]">Month</td>
                    {cols.map((c) => (
                      <td key={c.id} className="px-2.5 py-1 text-right tabular-nums">
                        {fmtHours(c.hh * 0.5)}
                      </td>
                    ))}
                    <td className="px-2.5 py-1 text-right tabular-nums border-l border-[#e1e0d9]">
                      {fmtHours(monthTotalHH * 0.5)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-[#898781] mt-1.5">
              Weeks run Monday to Sunday; the first and last are cut at the month’s edges so the rows add up to the
              month total.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
