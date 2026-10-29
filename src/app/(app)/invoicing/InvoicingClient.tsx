"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal, { ModalButton } from "@/components/Modal";
import { useBusyTransition } from "@/components/BusyOverlay";
import { fmtHours } from "@/lib/types";
import {
  addMonthsYm,
  csvCell,
  currencyOptions,
  formatNumber,
  lineAmount,
  monthLabelLong,
  type RateCell,
} from "@/lib/invoicing";
import { saveInvoiceRates, suggestInvoiceNumber, type RateChange } from "@/lib/actions/invoicing";

type AgentRow = { id: string; name: string };
type ProjectCol = { id: string; name: string; color: string };

const key = (a: string, p: string) => `${a}|${p}`;
const btn =
  "rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[13px] hover:bg-[#f3f2ee] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white";

// "" -> null (no rate); "12.5" -> 12.5; garbage -> undefined (invalid).
function parseRate(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : undefined;
}

export default function InvoicingClient({
  month,
  currency,
  agents,
  projects,
  hours,
  rates,
  invoiced,
}: {
  month: string;
  currency: string;
  agents: AgentRow[];
  projects: ProjectCol[];
  hours: Record<string, number>; // "agent|project" -> half-hours
  rates: Record<string, RateCell>;
  invoiced: Record<string, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useBusyTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hideZero, setHideZero] = useState(false);
  const [exportFor, setExportFor] = useState<AgentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currencies = useMemo(() => currencyOptions(), []);

  const hh = (a: string, p: string) => hours[key(a, p)] ?? 0;
  const savedRate = (a: string, p: string) => rates[key(a, p)]?.rate ?? null;

  // The rate in force for a cell: the admin's unsaved edit if there is one,
  // otherwise the saved (possibly carried-forward) rate. Unparseable edits
  // fall back to the saved value and are flagged in red.
  function rateOf(a: string, p: string): number | null {
    const k = key(a, p);
    if (k in draft) {
      const v = parseRate(draft[k]);
      if (v !== undefined) return v;
    }
    return savedRate(a, p);
  }

  const rowHH = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of agents) m[a.id] = projects.reduce((s, p) => s + (hours[key(a.id, p.id)] ?? 0), 0);
    return m;
  }, [agents, projects, hours]);
  const colHH = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of projects) m[p.id] = agents.reduce((s, a) => s + (hours[key(a.id, p.id)] ?? 0), 0);
    return m;
  }, [agents, projects, hours]);

  const shownAgents = hideZero ? agents.filter((a) => rowHH[a.id] > 0) : agents;
  const shownProjects = hideZero ? projects.filter((p) => colHH[p.id] > 0) : projects;

  const amount = (a: string, p: string) => lineAmount(hh(a, p), rateOf(a, p));
  const rowAmt = (a: string) => shownProjects.reduce((s, p) => s + amount(a, p.id), 0);
  const colAmt = (p: string) => shownAgents.reduce((s, a) => s + amount(a.id, p), 0);
  const grandHH = shownAgents.reduce((s, a) => s + shownProjects.reduce((t, p) => t + hh(a.id, p.id), 0), 0);
  const grandAmt = shownAgents.reduce((s, a) => s + rowAmt(a.id), 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  // Edits that differ from what's saved, and any that don't parse.
  const { changes, invalidCount } = useMemo(() => {
    const out: RateChange[] = [];
    let bad = 0;
    for (const [k, v] of Object.entries(draft)) {
      const parsed = parseRate(v);
      if (parsed === undefined) {
        bad++;
        continue;
      }
      const [agentId, projectId] = k.split("|");
      const saved = rates[k]?.rate ?? null;
      if (parsed !== saved) out.push({ agentId, projectId, rate: parsed });
    }
    return { changes: out, invalidCount: bad };
  }, [draft, rates]);
  const dirty = changes.length > 0 || invalidCount > 0;

  function go(next: { month?: string; currency?: string }) {
    if (dirty && !window.confirm("Discard unsaved rate changes?")) return;
    const sp = new URLSearchParams({ month: next.month ?? month, currency: next.currency ?? currency });
    router.push(`/invoicing?${sp.toString()}`);
  }

  function fillColumn(projectId: string, raw: string) {
    if (parseRate(raw) === undefined) return;
    setDraft((d) => {
      const n = { ...d };
      for (const a of shownAgents) n[key(a.id, projectId)] = raw.trim();
      return n;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveInvoiceRates(month, currency, changes);
        setDraft({});
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save rates.");
      }
    });
  }

  function exportCsv() {
    const rows: (string | number)[][] = [];
    const head = ["Agent", ...shownProjects.map((p) => p.name), "Total"];
    rows.push([`Monthly hours - ${monthLabelLong(month)}`]);
    rows.push(head);
    for (const a of shownAgents) {
      rows.push([a.name, ...shownProjects.map((p) => hh(a.id, p.id) * 0.5), rowHH[a.id] * 0.5]);
    }
    rows.push(["Total", ...shownProjects.map((p) => colHH[p.id] * 0.5), grandHH * 0.5]);
    rows.push([]);
    rows.push([`Hourly rates (${currency})`]);
    rows.push(["Agent", ...shownProjects.map((p) => p.name)]);
    for (const a of shownAgents) rows.push([a.name, ...shownProjects.map((p) => rateOf(a.id, p.id) ?? "")]);
    rows.push([]);
    rows.push([`Amount due (${currency})`]);
    rows.push(head);
    for (const a of shownAgents) {
      rows.push([a.name, ...shownProjects.map((p) => amount(a.id, p.id)), r2(rowAmt(a.id))]);
    }
    rows.push(["Total", ...shownProjects.map((p) => r2(colAmt(p.id))), r2(grandAmt)]);

    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoicing-${month}-${currency}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "text-right px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium whitespace-nowrap";
  const nameTh = "text-left px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-[#898781] font-medium sticky left-0 bg-[#f3f2ee]";
  const nameTd = "px-2.5 py-1 whitespace-nowrap sticky left-0 bg-[#fcfcfb] border-r border-[#e1e0d9]";
  const projHead = (p: ProjectCol) => (
    <span className="inline-flex items-center gap-1.5 justify-end">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
      {p.name}
    </span>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-[19px] font-semibold">Invoicing</h2>
          <p className="text-[12.5px] text-[#898781]">
            {monthLabelLong(month)} · {fmtHours(grandHH * 0.5)}h · {currency} {formatNumber(r2(grandAmt))}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className={btn} onClick={() => go({ month: addMonthsYm(month, -1) })}>
            ←
          </button>
          <input
            type="month"
            className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1.5 text-[13px]"
            value={month}
            onChange={(e) => e.target.value && go({ month: e.target.value })}
          />
          <button className={btn} onClick={() => go({ month: addMonthsYm(month, 1) })}>
            →
          </button>
          <select
            className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1.5 text-[13px] max-w-[200px]"
            value={currency}
            onChange={(e) => go({ currency: e.target.value })}
            aria-label="Currency"
          >
            {!currencies.some((c) => c.code === currency) && <option value={currency}>{currency}</option>}
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-[#52514e]">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
            Hide all-zero rows/columns
          </label>
          <button className={btn} onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {dirty && (
        <div className="sticky top-0 z-30 mb-3 flex items-center gap-2.5 flex-wrap bg-[#e8f0fb] border border-[#2a78d6] rounded-lg px-3 py-2 text-[12.5px]">
          <span>
            {changes.length} unsaved rate change{changes.length === 1 ? "" : "s"}
            {invalidCount > 0 && <span className="text-[#d03b3b]"> · {invalidCount} invalid (must be a number, 0 or more)</span>}
          </span>
          <button
            className="rounded-md bg-[#2a78d6] text-white px-2.5 py-1 text-[12.5px] font-semibold disabled:opacity-50"
            disabled={isPending || invalidCount > 0 || changes.length === 0}
            onClick={save}
          >
            Save rates
          </button>
          <button className="text-[#52514e] underline" onClick={() => setDraft({})}>
            Discard
          </button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-[#d03b3b] mb-3">{error}</p>}

      {shownAgents.length === 0 || shownProjects.length === 0 ? (
        <p className="text-[13px] text-[#898781] border border-[#e1e0d9] rounded-lg p-6 text-center">
          {agents.length === 0 || projects.length === 0
            ? "No agents or projects yet."
            : "No hours logged in this month. Untick “Hide all-zero rows/columns” to see everyone."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 1. Monthly hours --------------------------------------------- */}
          <section>
            <h3 className="text-[13.5px] font-semibold mb-1.5">Monthly hours</h3>
            <div className="border border-[#e1e0d9] rounded-lg overflow-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="bg-[#f3f2ee]">
                  <tr>
                    <th className={nameTh}>Agent</th>
                    {shownProjects.map((p) => (
                      <th key={p.id} className={th}>
                        {projHead(p)}
                      </th>
                    ))}
                    <th className={`${th} border-l border-[#e1e0d9]`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {shownAgents.map((a) => (
                    <tr key={a.id} className="border-t border-[#e1e0d9]">
                      <td className={nameTd}>{a.name}</td>
                      {shownProjects.map((p) => {
                        const v = hh(a.id, p.id);
                        return (
                          <td
                            key={p.id}
                            className={`px-2.5 py-1 text-right tabular-nums ${v === 0 ? "bg-[#f3f2ee] text-[#c3c2b7]" : ""}`}
                          >
                            {fmtHours(v * 0.5)}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-1 text-right tabular-nums font-semibold border-l border-[#e1e0d9]">
                        {fmtHours(shownProjects.reduce((s, p) => s + hh(a.id, p.id), 0) * 0.5)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#c3c2b7] bg-[#f3f2ee] font-semibold">
                    <td className={`${nameTd} bg-[#f3f2ee]`}>Total</td>
                    {shownProjects.map((p) => (
                      <td key={p.id} className="px-2.5 py-1 text-right tabular-nums">
                        {fmtHours(shownAgents.reduce((s, a) => s + hh(a.id, p.id), 0) * 0.5)}
                      </td>
                    ))}
                    <td className="px-2.5 py-1 text-right tabular-nums border-l border-[#e1e0d9]">
                      {fmtHours(grandHH * 0.5)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Hourly rates ---------------------------------------------- */}
          <section>
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1.5">
              <h3 className="text-[13.5px] font-semibold">Hourly rates ({currency})</h3>
              <p className="text-[11.5px] text-[#898781]">
                Only you can see these. A rate carries forward to later months until you change it;{" "}
                <em>italic</em> = carried forward. Type a number in a project’s “fill” box and press Enter to
                apply it to every agent in that column.
              </p>
            </div>
            <div className="border border-[#e1e0d9] rounded-lg overflow-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="bg-[#f3f2ee]">
                  <tr>
                    <th className={nameTh}>Agent</th>
                    {shownProjects.map((p) => (
                      <th key={p.id} className={th}>
                        <div>{projHead(p)}</div>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="fill ↓"
                          aria-label={`Fill ${p.name} rate for all agents`}
                          className="mt-1 w-[78px] rounded border border-[#c3c2b7] bg-white px-1.5 py-0.5 text-[11.5px] text-right normal-case tracking-normal"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              fillColumn(p.id, e.currentTarget.value);
                              e.currentTarget.value = "";
                            }
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownAgents.map((a) => (
                    <tr key={a.id} className="border-t border-[#e1e0d9]">
                      <td className={nameTd}>{a.name}</td>
                      {shownProjects.map((p) => {
                        const k = key(a.id, p.id);
                        const cell = rates[k];
                        const shown = k in draft ? draft[k] : cell?.rate != null ? String(cell.rate) : "";
                        const invalid = k in draft && parseRate(draft[k]) === undefined;
                        const inherited = !(k in draft) && !!cell?.inherited && cell.rate !== null;
                        return (
                          <td key={p.id} className={`px-1.5 py-1 text-right ${hh(a.id, p.id) === 0 ? "bg-[#f3f2ee]" : ""}`}>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="—"
                              value={shown}
                              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                              className={`w-[78px] rounded border px-1.5 py-0.5 text-right tabular-nums bg-white ${
                                invalid ? "border-[#d03b3b]" : "border-[#c3c2b7]"
                              } ${inherited ? "italic text-[#52514e]" : ""}`}
                              aria-label={`${a.name} rate on ${p.name}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Amount due ------------------------------------------------ */}
          <section>
            <h3 className="text-[13.5px] font-semibold mb-1.5">
              Amount due ({currency}) <span className="font-normal text-[#898781]">= hours × rate</span>
            </h3>
            <div className="border border-[#e1e0d9] rounded-lg overflow-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead className="bg-[#f3f2ee]">
                  <tr>
                    <th className={nameTh}>Agent</th>
                    {shownProjects.map((p) => (
                      <th key={p.id} className={th}>
                        {projHead(p)}
                      </th>
                    ))}
                    <th className={`${th} border-l border-[#e1e0d9]`}>Total</th>
                    <th className={th}>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {shownAgents.map((a) => (
                    <tr key={a.id} className="border-t border-[#e1e0d9]">
                      <td className={nameTd}>{a.name}</td>
                      {shownProjects.map((p) => {
                        const v = amount(a.id, p.id);
                        const noRate = hh(a.id, p.id) > 0 && rateOf(a.id, p.id) === null;
                        return (
                          <td
                            key={p.id}
                            title={noRate ? "Hours logged but no rate set" : undefined}
                            className={`px-2.5 py-1 text-right tabular-nums ${
                              noRate
                                ? "text-[#b87400]"
                                : v === 0
                                ? "bg-[#f3f2ee] text-[#c3c2b7]"
                                : ""
                            }`}
                          >
                            {noRate ? "no rate" : formatNumber(v)}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-1 text-right tabular-nums font-semibold border-l border-[#e1e0d9]">
                        {formatNumber(r2(rowAmt(a.id)))}
                      </td>
                      <td className="px-2.5 py-1 text-right whitespace-nowrap">
                        {invoiced[a.id] && <span className="text-[11px] text-[#898781] mr-1.5">{invoiced[a.id]}</span>}
                        <button
                          className="rounded-md border border-[#c3c2b7] bg-white px-2 py-0.5 text-[12px] hover:bg-[#f3f2ee] disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={rowHH[a.id] === 0 || dirty}
                          title={dirty ? "Save your rate changes first" : rowHH[a.id] === 0 ? "No hours this month" : undefined}
                          onClick={() => setExportFor(a)}
                        >
                          Invoice…
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#c3c2b7] bg-[#f3f2ee] font-semibold">
                    <td className={`${nameTd} bg-[#f3f2ee]`}>Total</td>
                    {shownProjects.map((p) => (
                      <td key={p.id} className="px-2.5 py-1 text-right tabular-nums">
                        {formatNumber(r2(colAmt(p.id)))}
                      </td>
                    ))}
                    <td className="px-2.5 py-1 text-right tabular-nums border-l border-[#e1e0d9]">
                      {formatNumber(r2(grandAmt))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {exportFor && (
        <InvoiceModal
          agent={exportFor}
          month={month}
          currency={currency}
          total={r2(rowAmt(exportFor.id))}
          halfHours={rowHH[exportFor.id]}
          unpriced={projects.filter((p) => hh(exportFor.id, p.id) > 0 && savedRate(exportFor.id, p.id) === null).length}
          onClose={() => setExportFor(null)}
        />
      )}
    </div>
  );
}

function InvoiceModal({
  agent,
  month,
  currency,
  total,
  halfHours,
  unpriced,
  onClose,
}: {
  agent: AgentRow;
  month: string;
  currency: string;
  total: number;
  halfHours: number;
  unpriced: number;
  onClose: () => void;
}) {
  const [number, setNumber] = useState("");
  const [existing, setExisting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useBusyTransition();

  // Prefill once on open with the number this admin already used for this
  // agent + month, or the next in sequence.
  useEffect(() => {
    startTransition(async () => {
      try {
        const s = await suggestInvoiceNumber(agent.id, month, currency);
        setNumber(s.number);
        setExisting(s.existing);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't suggest a number.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function download() {
    setErr(null);
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({ agent: agent.id, month, currency, number: number.trim() });
        const res = await fetch(`/invoicing/invoice?${qs.toString()}`, { credentials: "same-origin" });
        if (!res.ok) {
          setErr((await res.text()) || `Export failed (${res.status}).`);
          return;
        }
        const cd = res.headers.get("Content-Disposition") ?? "";
        const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `Invoice-${number.trim()}.pdf`;
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Export failed.");
      }
    });
  }

  return (
    <Modal
      title={`Invoice: ${agent.name}`}
      subtitle={`${monthLabelLong(month)} · ${fmtHours(halfHours * 0.5)}h · ${currency} ${formatNumber(total)}`}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={download}>
            Download PDF
          </ModalButton>
        </>
      }
    >
      <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
        Invoice number
        <input
          className="rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px] bg-white"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          disabled={isPending && !number}
          maxLength={40}
        />
      </label>
      <p className="text-[11.5px] text-[#898781] mt-1.5">
        {existing
          ? "This agent already has an invoice for this month; exporting again re-uses (and can change) its number."
          : "Suggested as the next number in sequence. Edit it if you need a different one."}
      </p>
      {unpriced > 0 && (
        <p className="text-[12px] text-[#b87400] mt-2">
          {unpriced} project{unpriced === 1 ? " has" : "s have"} hours but no rate; {unpriced === 1 ? "it" : "they"} will
          show on the invoice without an amount and won’t be in the total.
        </p>
      )}
      {err && <p className="text-[12.5px] text-[#d03b3b] mt-2">{err}</p>}
    </Modal>
  );
}
