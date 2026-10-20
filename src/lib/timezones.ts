// Timezone helpers. Timesheet entries are stored as (local date, half-hour
// slot) on each agent's own wall clock - see supabase/migrations/0006 - and
// an agent's IANA timezone (e.g. "Europe/London") is what turns that local
// time into a real instant for reporting. These helpers are pure (no React,
// no server-only APIs) so both Server Components and Client Components can
// import them.

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
