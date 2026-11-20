// Assign Hours: shared types and small helpers (no server code).

export interface HourWeek {
  id: string;
  project_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
}

export interface HourCell {
  week_id: string;
  agent_id: string;
  hours: number;
}

export interface HourColour {
  week_id: string;
  agent_id: string;
  colour: string;
}

export const cellKey = (weekId: string, agentId: string) => `${weekId}|${agentId}`;

// Admin brush colours (stored by name so the palette can be restyled freely).
export const HOUR_COLOURS: { key: string; label: string; bg: string; fg: string }[] = [
  { key: "red", label: "Red", bg: "#f8d7d4", fg: "#8a1f17" },
  { key: "orange", label: "Orange", bg: "#fde3c8", fg: "#8a4b0c" },
  { key: "yellow", label: "Yellow", bg: "#fbf0b8", fg: "#6b5a00" },
  { key: "green", label: "Green", bg: "#d4efd2", fg: "#1c5a1c" },
  { key: "blue", label: "Blue", bg: "#d3e4f8", fg: "#1b4f8f" },
  { key: "purple", label: "Purple", bg: "#e4d9f5", fg: "#4b2a85" },
  { key: "grey", label: "Grey", bg: "#e4e3dd", fg: "#52514e" },
];
export const colourOf = (key: string | undefined) => HOUR_COLOURS.find((c) => c.key === key);

export function fmtHrs(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// --- date strings (YYYY-MM-DD), UTC arithmetic so the server's zone never matters ---
const p2 = (n: number) => String(n).padStart(2, "0");
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
export const addDaysStr = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
// First Monday strictly after the given date.
export function nextMonday(s: string): string {
  const dow = parse(s).getUTCDay(); // 0 Sun .. 6 Sat
  return addDaysStr(s, ((8 - dow) % 7) || 7);
}
export const isDateStr = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;

export function fmtDay(s: string): string {
  return parse(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export function fmtRange(a: string, b: string): string {
  return `${fmtDay(a)} – ${fmtDay(b)}`;
}
