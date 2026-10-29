import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/data";
import { isCurrency, isMonth, isValidInvoiceNumber, lineAmount } from "@/lib/invoicing";
import { buildInvoicePdf, type InvoiceLine } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(status: number, message: string) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

// GET /invoicing/invoice?agent=<id>&month=YYYY-MM&currency=GBP&number=INV-...
// Admin only. Everything on the invoice is recomputed here from the database
// (hours from the timesheet, rates from the calling admin's own saved rates);
// nothing is trusted from the browser except the choices above. Exporting also
// records the invoice (number, total, line snapshot), so numbers are tracked.
export async function GET(request: NextRequest) {
  const me = await getCurrentAgent();
  if (!me) return bad(401, "Not signed in");
  if (me.role !== "admin") return bad(403, "Admins only");

  const sp = request.nextUrl.searchParams;
  const agentId = sp.get("agent") ?? "";
  const month = sp.get("month") ?? "";
  const currency = sp.get("currency") ?? "";
  const number = (sp.get("number") ?? "").trim();
  if (!UUID.test(agentId) || !isMonth(month) || !isCurrency(currency)) return bad(400, "Invalid request");
  if (!isValidInvoiceNumber(number)) {
    return bad(400, "Invoice number must be 1-40 characters: letters, numbers, spaces and - _ . / #");
  }

  const supabase = await createClient();
  const monthStart = `${month}-01`;

  const [{ data: agent }, { data: hoursRows }, { data: rateRows }, { data: projects }] = await Promise.all([
    supabase.from("agents").select("id, name").eq("id", agentId).maybeSingle(),
    supabase.rpc("invoicing_hours", { p_month: monthStart }),
    supabase.rpc("invoice_rates_effective", { p_month: monthStart, p_currency: currency }),
    supabase.from("projects").select("id, name"),
  ]);
  if (!agent) return bad(404, "Agent not found");

  const nameOf = new Map<string, string>((projects ?? []).map((p) => [p.id as string, p.name as string]));
  const rateOf = new Map<string, number | null>();
  for (const r of (rateRows ?? []) as { agent_id: string; project_id: string; rate: number | null }[]) {
    if (r.agent_id === agentId) rateOf.set(r.project_id, r.rate === null ? null : Number(r.rate));
  }

  const lines: InvoiceLine[] = [];
  for (const h of (hoursRows ?? []) as { agent_id: string; project_id: string; half_hours: number }[]) {
    if (h.agent_id !== agentId) continue;
    const hh = Number(h.half_hours);
    if (hh <= 0) continue;
    const rate = rateOf.get(h.project_id) ?? null;
    lines.push({ project: nameOf.get(h.project_id) ?? "Unknown project", halfHours: hh, rate, amount: lineAmount(hh, rate) });
  }
  if (lines.length === 0) return bad(409, "This agent has no hours in that month.");
  lines.sort((a, b) => a.project.localeCompare(b.project));

  const totalHalfHours = lines.reduce((s, l) => s + l.halfHours, 0);
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

  const { error } = await supabase.from("invoices").upsert(
    {
      issued_by: me.id,
      agent_id: agentId,
      agent_name: agent.name as string,
      period: monthStart,
      currency,
      invoice_number: number,
      total,
      lines,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "issued_by,agent_id,period,currency" }
  );
  if (error) {
    if (error.code === "23505") return bad(409, `Invoice number "${number}" is already used by another invoice.`);
    return bad(500, error.message);
  }

  const pdf = await buildInvoicePdf({
    number,
    agentName: agent.name as string,
    month,
    currency,
    lines,
    totalHalfHours,
    total,
  });

  const fileSafe = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const filename = `Invoice-${fileSafe(number)}-${fileSafe(agent.name as string)}-${month}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
