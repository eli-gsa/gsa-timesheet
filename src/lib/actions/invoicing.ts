"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import { isCurrency, isMonth, nextInvoiceNumber } from "@/lib/invoicing";

export type RateChange = { agentId: string; projectId: string; rate: number | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Saves the calling admin's changed rates for one month + currency. Each
// change becomes a row effective from that month; later months inherit it
// until they have a row of their own, earlier months are untouched. Rates are
// private to the admin (RLS: admin_id = the caller), so this can never change
// another admin's numbers.
export async function saveInvoiceRates(month: string, currency: string, changes: RateChange[]) {
  const me = await requireAdmin();
  if (!isMonth(month)) throw new Error("Invalid month");
  if (!isCurrency(currency)) throw new Error("Invalid currency");
  if (!Array.isArray(changes) || changes.length === 0) return;
  if (changes.length > 5000) throw new Error("Too many changes at once");

  const now = new Date().toISOString();
  const rows = changes.map((c) => {
    if (!UUID.test(c.agentId) || !UUID.test(c.projectId)) throw new Error("Invalid agent or project");
    if (c.rate !== null && (!Number.isFinite(c.rate) || c.rate < 0 || c.rate > 1_000_000)) {
      throw new Error("Rates must be a number, 0 or more");
    }
    return {
      admin_id: me.id,
      agent_id: c.agentId,
      project_id: c.projectId,
      currency,
      effective_month: `${month}-01`,
      rate: c.rate === null ? null : Math.round(c.rate * 100) / 100,
      updated_at: now,
    };
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_rates")
    .upsert(rows, { onConflict: "admin_id,agent_id,project_id,currency,effective_month" });
  if (error) throw new Error(error.message);

  revalidatePath("/invoicing");
}

// The invoice number to prefill in the export dialog: the number this admin
// already used for the same agent + month + currency if there is one,
// otherwise the next in sequence after the latest issued by anyone.
export async function suggestInvoiceNumber(
  agentId: string,
  month: string,
  currency: string
): Promise<{ number: string; existing: boolean }> {
  const me = await requireAdmin();
  if (!UUID.test(agentId) || !isMonth(month) || !isCurrency(currency)) throw new Error("Invalid request");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("issued_by", me.id)
    .eq("agent_id", agentId)
    .eq("period", `${month}-01`)
    .eq("currency", currency)
    .maybeSingle();
  if (existing?.invoice_number) return { number: existing.invoice_number as string, existing: true };

  const { data: last } = await supabase.rpc("invoice_last_number");
  return { number: nextInvoiceNumber((last as string | null) ?? null, Number(month.slice(0, 4))), existing: false };
}
