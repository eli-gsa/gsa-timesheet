// Timezone helpers. Timesheet entries are stored as a real instant plus the
// same moment on the UK wall clock (entry_date / slot, Europe/London with
// BST/GMT) - see supabase/migrations/0012. Agents type and see their own
// local time; the database converts. An agent's IANA timezone (set by an
// admin) is only used for that conversion. These helpers are pure (no React,
// no server-only APIs) so both Server Components and Client Components can
// import them.

// The zone everything is stored and reported in.
export const UK_ZONE = "Europe/London";

// The zone an agent works in: their own, or UK when none is set.
export function zoneOf(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : UK_ZONE;
}

// "UTC+2" / "UTC+1" style label for a zone right now.
export function zoneOffsetLabel(tz: string, now: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    return (part ?? "").replace("GMT", "UTC") || "UTC";
  } catch {
    return "";
  }
}

// Shown first in the admin's timezone picker; the full IANA list follows.
export const COMMON_TIMEZONES = [
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

// Every IANA zone this runtime knows, with the common ones guaranteed
// present (some runtimes omit "UTC" from supportedValuesOf).
export function allTimeZones(): string[] {
  const supported: string[] =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return Array.from(new Set([...COMMON_TIMEZONES, ...supported])).sort();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "Today" as YYYY-MM-DD on the given timezone's calendar. With no timezone
// set (or an unrecognised one) it falls back to the runtime's own local
// date - the browser's in a Client Component, the server's (UTC on Vercel)
// in a Server Component - which is exactly what the app did before
// timezones existed, so agents without one set see no change.
export function todayIn(tz: string | null | undefined, now: Date = new Date()): string {
  if (tz && isValidTimeZone(tz)) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
