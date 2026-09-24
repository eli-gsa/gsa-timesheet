import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent, AuditLogRow, Project } from "@/lib/types";
import AuditClient from "./AuditClient";

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; project?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(0, Number(params.page) || 0);

  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("ts", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (params.agent && params.agent !== "all") query = query.eq("agent_id", params.agent);
  if (params.project && params.project !== "all") query = query.eq("project_id", params.project);

  const [{ data: rows, count }, { data: agents }, { data: projects }] = await Promise.all([
    query,
    supabase.from("agents").select("*").order("name"),
    supabase.from("projects").select("*").order("name"),
  ]);

  return (
    <AuditClient
      rows={(rows as AuditLogRow[]) ?? []}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      agents={(agents as Agent[]) ?? []}
      projects={(projects as Project[]) ?? []}
      agentFilter={params.agent || "all"}
      projectFilter={params.project || "all"}
    />
  );
}
