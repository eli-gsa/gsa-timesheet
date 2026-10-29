import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { todayIn } from "@/lib/timezones";
import { DEFAULT_CURRENCY, isCurrency, isMonth, type RateCell } from "@/lib/invoicing";
import InvoicingClient from "./InvoicingClient";

export default async function InvoicingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; currency?: string }>;
}) {
  const me = await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();

  const month = isMonth(params.month) ? params.month : todayIn(me.timezone).slice(0, 7);
  const monthStart = `${month}-01`;

  // Currency: explicit ?currency=, else the one this admin last saved a rate
  // in, else the default.
  let currency: string;
  if (isCurrency(params.currency)) {
    currency = params.currency;
  } else {
    const { data: last } = await supabase
      .from("invoice_rates")
      .select("currency")
      .eq("admin_id", me.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    currency = isCurrency(last?.[0]?.currency) ? (last![0].currency as string) : DEFAULT_CURRENCY;
  }

  const [{ data: agents }, { data: projects }, { data: hoursRows }, { data: rateRows }, { data: invoiceRows }] =
    await Promise.all([
      supabase.from("agents").select("id, name, active").order("name"),
      supabase.from("projects").select("id, name, color, active").order("name"),
      supabase.rpc("invoicing_hours", { p_month: monthStart }),
      supabase.rpc("invoice_rates_effective", { p_month: monthStart, p_currency: currency }),
      supabase
        .from("invoices")
        .select("agent_id, invoice_number")
        .eq("issued_by", me.id)
        .eq("period", monthStart)
        .eq("currency", currency),
    ]);

  const hours: Record<string, number> = {};
  const agentHasHours = new Set<string>();
  const projectHasHours = new Set<string>();
  for (const h of (hoursRows ?? []) as { agent_id: string; project_id: string; half_hours: number }[]) {
    hours[`${h.agent_id}|${h.project_id}`] = Number(h.half_hours);
    agentHasHours.add(h.agent_id);
    projectHasHours.add(h.project_id);
  }

  const rates: Record<string, RateCell> = {};
  for (const r of (rateRows ?? []) as {
    agent_id: string;
    project_id: string;
    rate: number | null;
    effective_month: string;
  }[]) {
    rates[`${r.agent_id}|${r.project_id}`] = {
      rate: r.rate === null ? null : Number(r.rate),
      inherited: r.effective_month !== monthStart,
    };
  }

  const invoiced: Record<string, string> = {};
  for (const i of (invoiceRows ?? []) as { agent_id: string | null; invoice_number: string }[]) {
    if (i.agent_id) invoiced[i.agent_id] = i.invoice_number;
  }

  // Active agents/projects always show; an archived one only if it has hours
  // in the month (so past months still reconcile).
  const agentList = ((agents ?? []) as { id: string; name: string; active: boolean }[])
    .filter((a) => a.active || agentHasHours.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
  const projectList = ((projects ?? []) as { id: string; name: string; color: string; active: boolean }[])
    .filter((p) => p.active || projectHasHours.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, color: p.color }));

  return (
    <InvoicingClient
      key={`${month}|${currency}`}
      month={month}
      currency={currency}
      agents={agentList}
      projects={projectList}
      hours={hours}
      rates={rates}
      invoiced={invoiced}
    />
  );
}
