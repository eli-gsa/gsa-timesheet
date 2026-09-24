import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agent } from "@/lib/types";

// Fetches the signed-in person's own agents row. Returns null if the auth
// session exists but the agents row hasn't materialized (shouldn't normally
// happen — handle_new_user() creates it at sign-in — but a moment of
// replication lag or a manually-deleted row could produce this).
export async function getCurrentAgent(): Promise<Agent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("agents").select("*").eq("id", user.id).maybeSingle();
  return (data as Agent) ?? null;
}

// Use at the top of any admin-only Server Component / Server Action.
export async function requireAdmin(): Promise<Agent> {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");
  if (agent.role !== "admin") redirect("/timesheet");
  return agent;
}

export async function requireAgent(): Promise<Agent> {
  const agent = await getCurrentAgent();
  if (!agent) redirect("/login");
  return agent;
}
