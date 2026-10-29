import type { SupabaseClient } from "@supabase/supabase-js";

// The Supabase API returns at most 1000 rows per request, so any query that
// might match more must be read page by page. `page(from, to)` should build the
// same query each time with .range(from, to) and a stable .order().
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let i = 0; i < 500; i++) {
    const { data, error } = await page(i * size, i * size + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

type Sb = SupabaseClient;

// Hour totals are computed in the database (migration 0010) and fall back to
// paging through the entries if those functions aren't installed yet, so a
// deploy that lands before the SQL is run is slower but never wrong.
async function countBy(
  sb: Sb,
  fn: string,
  keyCol: string,
  start: string,
  end: string,
  table: "timesheet_entries"
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await sb.rpc(fn, { p_start: start, p_end: end });
  if (!error && data) {
    for (const r of data as Record<string, unknown>[]) out.set(String(r[keyCol]), Number(r.half_hours));
    return out;
  }
  const rows = await fetchAll<Record<string, string>>((from, to) =>
    sb
      .from(table)
      .select(keyCol)
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, string>[] | null; error: { message: string } | null }>
  );
  for (const r of rows) out.set(r[keyCol], (out.get(r[keyCol]) ?? 0) + 1);
  return out;
}

// Half-hour counts, keyed by id (or date).
export const hoursByAgent = (sb: Sb, start: string, end: string) =>
  countBy(sb, "hours_by_agent", "agent_id", start, end, "timesheet_entries");
export const hoursByProject = (sb: Sb, start: string, end: string) =>
  countBy(sb, "hours_by_project", "project_id", start, end, "timesheet_entries");
export const hoursByDay = (sb: Sb, start: string, end: string) =>
  countBy(sb, "hours_by_day", "entry_date", start, end, "timesheet_entries");

async function distinctIds(sb: Sb, fn: string, col: "agent_id" | "project_id"): Promise<string[]> {
  const { data, error } = await sb.rpc(fn);
  if (!error && data) return (data as Record<string, string>[]).map((r) => r[col]);
  const rows = await fetchAll<Record<string, string>>((from, to) =>
    sb
      .from("timesheet_entries")
      .select(col)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: Record<string, string>[] | null; error: { message: string } | null }>
  );
  return Array.from(new Set(rows.map((r) => r[col])));
}
export const agentIdsWithHours = (sb: Sb) => distinctIds(sb, "agents_with_hours", "agent_id");
export const projectIdsWithHours = (sb: Sb) => distinctIds(sb, "projects_with_hours", "project_id");
