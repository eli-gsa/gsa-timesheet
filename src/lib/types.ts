// Shared types mirroring the Supabase schema in supabase/migrations/0001_schema.sql

export type Role = "admin" | "agent";

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  view_start_slot: number;
  view_end_slot: number;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
}

export interface ProjectAgent {
  project_id: string;
  agent_id: string;
}

export interface TimesheetEntry {
  id: string;
  agent_id: string;
  project_id: string;
  entry_date: string; // date
  slot: number; // 0-47, 30 min each
  created_at: string;
  updated_at: string;
}

export interface LeadType {
  id: string;
  name: string;
  created_at: string;
}

export interface Lead {
  id: string;
  agent_id: string;
  project_id: string;
  period: string; // YYYY-MM
  name: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  ts: string;
  actor_id: string | null;
  agent_id: string | null;
  project_id: string | null;
  entry_date: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

export interface StandardWorkDay {
  startSlot: number;
  endSlot: number;
}

export const SLOTS_PER_DAY = 48; // 30-minute slots across 24h

export function slotTime(slot: number): string {
  const h = Math.floor(slot / 2);
  const m = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function slotRangeLabel(slot: number): string {
  const start = slotTime(slot);
  const end = slotTime(slot + 1);
  return `${start}–${end}`;
}

export function fmtHours(h: number): string {
  return (Math.round(h * 100) / 100)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

// Picks readable label text (black or white) for a given project color
// background, via a simple luminance approximation.
export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}
