import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Agent } from "@/lib/types";

// Fetches the signed-in person's own agents row. Returns null if the auth
// session exists but the agents row hasn't materialized (shouldn't normally
// happen — handle_new_user() creates it at sign-in — but a moment of
// replication lag or a manually-deleted row could produce this).
//
// Trusts the x-user-id header set by proxy.ts (src/lib/supabase/middleware.ts),
// which has already verified the session for every request this app serves —
// avoiding a second, redundant network round trip to Supabase Auth per
// request. Falls back to a direct getUser() check if that header is ever
// missing (e.g. a code path middleware doesn't cover), so this stays safe
// even if the header isn't there.
export async function getCurrentAgent(): Promise<Agent | null> {
  const supabase = await createClient();

  const hdrs = await headers();
  let userId = hdrs.get("x-user-id");

  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  const { data } = await supabase.from("agents").select("*").eq("id", userId).maybeSingle();
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
