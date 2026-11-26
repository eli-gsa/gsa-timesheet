import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { fetchAll } from "@/lib/aggregates";
import { fmtRange, isDateStr } from "@/lib/hours";
import { DEFAULT_CURRENCY } from "@/lib/invoicing";
import { UK_ZONE, todayIn } from "@/lib/timezones";
import { buildLeadBonusPdf, rowAmount, type BonusRow, type BonusSection } from "@/lib/leadBonusPdf";
import { buildZip } from "@/lib/zip";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES = 200;

function bad(status: number, message: string) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
const fileSafe = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
const list = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

// GET /assign-hours/export?mode=agent|campaign&campaigns=id,id&agents=id,id&weeks=start_end,start_end
// Admin only. Everything is recomputed from the database; the lead list itself is
// not included. One file downloads as a PDF, several as a zip.
export async function GET(request: NextRequest) {
  const me = await getCurrentAgent();
  if (!me) return bad(401, "Not signed in");
  if (me.role !== "admin") return bad(403, "Admins only");

  const sp = request.nextUrl.searchParams;
  const mode = sp.get("mode");
  const campaignIds = list(sp.get("campaigns"));
  const agentIds = list(sp.get("agents"));
  const weekKeys = list(sp.get("weeks"));
  if (mode !== "agent" && mode !== "campaign") return bad(400, "Invalid request");
  if (!campaignIds.length || !agentIds.length || !weekKeys.length) return bad(400, "Pick campaigns, agents and weeks");
  if (campaignIds.length > 200 || agentIds.length > 500 || weekKeys.length > 200) return bad(400, "Too many selected");
  if (![...campaignIds, ...agentIds].every((i) => UUID.test(i))) return bad(400, "Invalid request");
  const wanted = new Set<string>();
  for (const k of weekKeys) {
    const [s, e] = k.split("_");
    if (!isDateStr(s) || !isDateStr(e)) return bad(400, "Invalid week");
    wanted.add(k);
  }

  const supabase = await createClient();
  const [{ data: projects }, { data: agents }, weeks, rates, counts, { data: settings }] = await Promise.all([
    supabase.from("projects").select("id, name").in("id", campaignIds),
    supabase.from("agents").select("id, name").in("id", agentIds),
    fetchAll<{ id: string; project_id: string; start_date: string; end_date: string }>(
      (f, t) =>
        supabase
          .from("hour_weeks")
          .select("id, project_id, start_date, end_date")
          .in("project_id", campaignIds)
          .order("start_date")
          .order("id")
          .range(f, t) as never
    ),
    fetchAll<{ week_id: string; agent_id: string; amount: number }>(
      (f, t) =>
        supabase.from("lead_bonus_rates").select("week_id, agent_id, amount").order("week_id").order("agent_id").range(f, t) as never
    ),
    fetchAll<{ week_id: string; agent_id: string; leads: number }>(
      (f, t) =>
        supabase.rpc("lead_week_counts", { p_agent: null }).order("week_id").order("agent_id").range(f, t) as never
    ),
    supabase.from("lead_bonus_settings").select("project_id, currency").in("project_id", campaignIds),
  ]);

  const nameOfProject = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));
  const agentList = (agents ?? []).map((a) => ({ id: a.id as string, name: a.name as string })).sort((a, b) => a.name.localeCompare(b.name));
  const currencyOf = new Map((settings ?? []).map((s) => [s.project_id as string, s.currency as string]));
  const rateOf = new Map(rates.map((r) => [`${r.week_id}|${r.agent_id}`, Number(r.amount)]));
  const leadsOf = new Map(counts.map((c) => [`${c.week_id}|${c.agent_id}`, Number(c.leads)]));

  const generated = todayIn(UK_ZONE);
  const files: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  const uniqueName = (base: string) => {
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = base.replace(/\.pdf$/, `-${i}.pdf`);
    used.add(n.toLowerCase());
    return n;
  };

  for (const pid of campaignIds) {
    const campaign = nameOfProject.get(pid);
    if (!campaign) continue;
    const currency = currencyOf.get(pid) ?? DEFAULT_CURRENCY;
    const pWeeks = weeks.filter((w) => w.project_id === pid && wanted.has(`${w.start_date}_${w.end_date}`));
    if (!pWeeks.length) continue;

    const rowsFor = (agentId: string): BonusRow[] => {
      const out: BonusRow[] = [];
      for (const w of pWeeks) {
        const leads = leadsOf.get(`${w.id}|${agentId}`) ?? 0;
        const rate = rateOf.get(`${w.id}|${agentId}`) ?? 0;
        if (leads === 0 && rate === 0) continue;
        out.push({ week: fmtRange(w.start_date, w.end_date), leads, rate, amount: rowAmount(leads, rate) });
      }
      return out;
    };

    if (mode === "agent") {
      for (const a of agentList) {
        const rows = rowsFor(a.id);
        if (!rows.length) continue;
        const data = await buildLeadBonusPdf({
          campaign,
          currency,
          subtitle: a.name,
          sections: [{ heading: null, rows }],
          generated,
        });
        files.push({ name: uniqueName(`LeadBonus-${fileSafe(campaign)}-${fileSafe(a.name)}.pdf`), data });
      }
    } else {
      const sections: BonusSection[] = [];
      for (const a of agentList) {
        const rows = rowsFor(a.id);
        if (rows.length) sections.push({ heading: a.name, rows });
      }
      if (!sections.length) continue;
      const data = await buildLeadBonusPdf({
        campaign,
        currency,
        subtitle: sections.length === 1 ? sections[0].heading! : `${sections.length} agents`,
        sections,
        generated,
      });
      files.push({ name: uniqueName(`LeadBonus-${fileSafe(campaign)}.pdf`), data });
    }
    if (files.length > MAX_FILES) return bad(400, "Too many files; narrow the selection.");
  }

  if (files.length === 0) return bad(409, "Nothing to export: no lead bonuses or leads in that selection.");

  if (files.length === 1) {
    return new NextResponse(Buffer.from(files[0].data), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${files[0].name}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new NextResponse(Buffer.from(buildZip(files)), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="LeadBonuses-${generated}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
