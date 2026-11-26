"use client";

import { useMemo, useState } from "react";
import SearchMultiSelect from "@/components/SearchMultiSelect";
import { fmtRange, type HourWeek } from "@/lib/hours";
import { UK_ZONE, todayIn } from "@/lib/timezones";

type P = { id: string; name: string };
type A = { id: string; name: string };

// PDF export of lead bonuses: per campaign, or per agent per campaign; choose the
// campaigns, the agents and the weeks. Several files download as one zip.
export default function ExportDialog({
  projects,
  agents,
  weeks,
  participants,
  onClose,
}: {
  projects: P[];
  agents: A[];
  weeks: HourWeek[];
  participants: Record<string, string[]>; // project_id -> agent ids in its table
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"agent" | "campaign">("agent");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [weekKeys, setWeekKeys] = useState<string[]>([]);
  const [nWeeks, setNWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withWeeks = useMemo(() => {
    const ids = new Set(weeks.map((w) => w.project_id));
    return projects.filter((p) => ids.has(p.id));
  }, [projects, weeks]);

  // Agents available = those in the selected campaigns' tables.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const pid of campaignIds) for (const a of participants[pid] ?? []) ids.add(a);
    return agents.filter((a) => ids.has(a.id)).map((a) => ({ id: a.id, label: a.name }));
  }, [agents, campaignIds, participants]);
  const agentSel = agentIds.filter((id) => agentOptions.some((o) => o.id === id));

  // Weeks available = distinct date ranges across the selected campaigns.
  const weekOptions = useMemo(() => {
    const sel = new Set(campaignIds);
    const m = new Map<string, { key: string; start: string; end: string }>();
    for (const w of weeks) {
      if (!sel.has(w.project_id)) continue;
      const key = `${w.start_date}_${w.end_date}`;
      if (!m.has(key)) m.set(key, { key, start: w.start_date, end: w.end_date });
    }
    return Array.from(m.values()).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  }, [weeks, campaignIds]);
  const weekSel = weekKeys.filter((k) => weekOptions.some((o) => o.key === k));

  function nextWeeks() {
    const today = todayIn(UK_ZONE);
    const upcoming = weekOptions.filter((w) => w.end >= today).slice(0, Math.max(1, nWeeks));
    setWeekKeys(upcoming.map((w) => w.key));
  }

  const ready = campaignIds.length > 0 && agentSel.length > 0 && weekSel.length > 0;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const sp = new URLSearchParams({
        mode,
        campaigns: campaignIds.join(","),
        agents: agentSel.join(","),
        weeks: weekSel.join(","),
      });
      const res = await fetch(`/assign-hours/export?${sp.toString()}`);
      if (!res.ok) {
        setError((await res.text()) || "Export failed");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "lead-bonuses.pdf";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0b0b]/30 flex items-start justify-center p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-semibold mb-3">Export lead bonuses (PDF)</h4>

        <div className="flex gap-4 mb-3 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "agent"} onChange={() => setMode("agent")} />
            Per agent per campaign
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === "campaign"} onChange={() => setMode("campaign")} />
            Per campaign
          </label>
        </div>

        <div className="flex flex-col gap-3 text-[12px] text-[#52514e]">
          <div>
            Campaigns
            <div className="mt-1">
              <SearchMultiSelect
                width={440}
                options={withWeeks.map((p) => ({ id: p.id, label: p.name }))}
                selected={campaignIds}
                onChange={setCampaignIds}
                placeholder="Select campaigns…"
                allLabel="campaigns"
              />
            </div>
          </div>
          <div>
            Agents {mode === "campaign" && <span className="text-[#898781]">(included in each campaign PDF)</span>}
            <div className="mt-1">
              <SearchMultiSelect
                width={440}
                options={agentOptions}
                selected={agentSel}
                onChange={setAgentIds}
                placeholder={campaignIds.length ? "Select agents…" : "Pick campaigns first"}
                allLabel="agents"
              />
            </div>
          </div>
          <div>
            Weeks
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[#52514e]">Next</span>
              <input
                type="number"
                min={1}
                max={52}
                value={nWeeks}
                onChange={(e) => setNWeeks(Number(e.target.value))}
                className="w-16 rounded-md border border-[#c3c2b7] px-2 py-1 text-[13px]"
              />
              <span>weeks</span>
              <button type="button" onClick={nextWeeks} className="rounded-md border border-[#c3c2b7] px-2 py-1 hover:bg-[#f3f2ee]">
                Select
              </button>
              <button
                type="button"
                onClick={() => setWeekKeys(weekOptions.map((w) => w.key))}
                className="text-[#2a78d6] hover:underline"
              >
                All
              </button>
              <button type="button" onClick={() => setWeekKeys([])} className="hover:underline">
                None
              </button>
            </div>
            <div className="mt-2 max-h-[180px] overflow-y-auto rounded-md border border-[#e1e0d9] p-1">
              {weekOptions.length === 0 && <p className="px-2 py-1.5 text-[#898781]">Pick campaigns to see their weeks.</p>}
              {weekOptions.map((w) => (
                <label key={w.key} className="flex items-center gap-2 px-2 py-1 text-[13px] text-[#0b0b0b] hover:bg-[#f3f2ee] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={weekSel.includes(w.key)}
                    onChange={() =>
                      setWeekKeys(weekSel.includes(w.key) ? weekSel.filter((k) => k !== w.key) : [...weekSel, w.key])
                    }
                  />
                  {fmtRange(w.start, w.end)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-[12.5px] text-[#8a1f17]">{error}</p>}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-[12px] text-[#898781] mr-auto">
            {ready ? `${weekSel.length} week${weekSel.length === 1 ? "" : "s"} · several files download as one zip` : "Choose campaigns, agents and weeks"}
          </span>
          <button onClick={onClose} className="rounded-md border border-[#c3c2b7] px-3 py-1.5 text-[12.5px]">
            Close
          </button>
          <button
            disabled={!ready || busy}
            onClick={download}
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            {busy ? "Preparing…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
