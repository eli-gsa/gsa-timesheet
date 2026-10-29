// Hours-remaining helpers. Pure (no React / server-only APIs) so Server and
// Client Components can both import them.

export type AllocKind = "campaign" | "weekly" | "monthly";

// One allocation with its figures, as returned by the allocation_status()
// SQL function (see supabase/migrations/0009_allocations.sql).
export type AllocStatus = {
  allocationId: string;
  projectId: string;
  agentId: string;
  kind: AllocKind;
  startDate: string | null; // counting window (campaign); null = from the beginning
  endDate: string | null; // null = open-ended
  closedAt: string | null;
  note: string | null;
  totalHours: number; // campaign: sum of top-ups; weekly/monthly: the cap
  loggedHH: number | null; // half-hours inside the window (null = n/a)
  firstLogged: string | null;
  winStart: string | null; // the window actually counted (weekly/monthly: this week/month)
  winEnd: string | null;
};

type StatusRow = {
  allocation_id: string;
  project_id: string;
  agent_id: string;
  kind: AllocKind;
  start_date: string | null;
  end_date: string | null;
  closed_at: string | null;
  note: string | null;
  total_hours: number | string | null;
  logged_half_hours: number | string | null;
  first_logged: string | null;
  win_start: string | null;
  win_end: string | null;
};

export function mapStatusRows(rows: unknown): AllocStatus[] {
  return ((rows as StatusRow[] | null) ?? []).map((r) => ({
    allocationId: r.allocation_id,
    projectId: r.project_id,
    agentId: r.agent_id,
    kind: r.kind,
    startDate: r.start_date,
    endDate: r.end_date,
    closedAt: r.closed_at,
    note: r.note,
    totalHours: Number(r.total_hours ?? 0),
    loggedHH: r.logged_half_hours === null ? null : Number(r.logged_half_hours),
    firstLogged: r.first_logged,
    winStart: r.win_start,
    winEnd: r.win_end,
  }));
}

// ---- YYYY-MM-DD arithmetic in UTC (independent of any server timezone) ----
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function addDaysIso(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Monday-Friday days from `from` to `to` inclusive (0 if from > to).
export function workingDays(from: string, to: string): number {
  if (from > to) return 0;
  const a = parse(from);
  const b = parse(to);
  const total = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  const fullWeeks = Math.floor(total / 7);
  let count = fullWeeks * 5;
  const d = new Date(a.getTime() + fullWeeks * 7 * 86400000);
  for (let i = 0; i < total - fullWeeks * 7; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

export type Pace = {
  remainingH: number;
  daysLeft: number; // working days left in the window, counting today
  requiredPerDay: number | null; // null once the window has ended
  avgPerDay: number | null; // hours per working day so far (null if unknown)
  onTrack: boolean | null; // null = not enough data to say
  ended: boolean; // end date passed with hours still unused
  notStarted: boolean;
};

// Pace for a campaign allocation that has an end date: hours per working day
// still needed to use up what's left, against the average so far. Working
// days are Mon-Fri; public holidays aren't known to the app.
export function paceInfo(s: AllocStatus, today: string): Pace | null {
  if (s.kind !== "campaign" || !s.endDate || s.loggedHH === null) return null;
  const loggedH = s.loggedHH * 0.5;
  const remainingH = s.totalHours - loggedH;
  if (remainingH <= 0) return null;

  if (today > s.endDate) {
    return { remainingH, daysLeft: 0, requiredPerDay: null, avgPerDay: null, onTrack: null, ended: true, notStarted: false };
  }
  const notStarted = !!s.startDate && today < s.startDate;
  const from = notStarted ? (s.startDate as string) : today;
  const daysLeft = Math.max(1, workingDays(from, s.endDate));
  const requiredPerDay = remainingH / daysLeft;

  const since = s.startDate ?? s.firstLogged;
  let avgPerDay: number | null = null;
  if (since && !notStarted) {
    const elapsed = workingDays(since, addDaysIso(today, -1));
    if (elapsed > 0) avgPerDay = loggedH / elapsed;
  }
  const onTrack = avgPerDay === null ? null : avgPerDay >= requiredPerDay;
  return { remainingH, daysLeft, requiredPerDay, avgPerDay, onTrack, ended: false, notStarted };
}

export type AllocFigures = {
  total: number;
  logged: number;
  left: number;
  pct: number;
  tone: "ok" | "low" | "over";
};

// Amber at 90% used, red once over.
export function figures(s: AllocStatus): AllocFigures {
  const logged = (s.loggedHH ?? 0) * 0.5;
  const left = s.totalHours - logged;
  const pct = s.totalHours > 0 ? logged / s.totalHours : left < 0 ? 2 : 0;
  const tone = left < 0 ? "over" : pct >= 0.9 ? "low" : "ok";
  return { total: s.totalHours, logged, left, pct, tone };
}

export function windowLabel(s: { startDate: string | null; endDate: string | null }): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (s.startDate && s.endDate) return `${f(s.startDate)} – ${f(s.endDate)}`;
  if (s.startDate) return `from ${f(s.startDate)}`;
  if (s.endDate) return `until ${f(s.endDate)}`;
  return "all hours";
}
