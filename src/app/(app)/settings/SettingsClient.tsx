"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadType, StandardWorkDay } from "@/lib/types";
import { addLeadType, removeLeadType, updateStandardWorkDay } from "@/lib/actions/settings";
import { addAdminEmail, addAllowedDomain, removeAdminEmail, removeAllowedDomain } from "@/lib/actions/agents";

function slotToTime(slot: number) {
  const h = Math.floor(slot / 2);
  const min = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default function SettingsClient({
  leadTypes,
  standardWorkDay,
  domains,
  adminEmails,
}: {
  leadTypes: LeadType[];
  standardWorkDay: StandardWorkDay;
  domains: string[];
  adminEmails: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newType, setNewType] = useState("");
  const [start, setStart] = useState(standardWorkDay.startSlot);
  const [end, setEnd] = useState(standardWorkDay.endSlot);
  const [newDomain, setNewDomain] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <h2 className="text-[19px] font-semibold">Settings</h2>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
        <h3 className="text-[13.5px] font-semibold mb-2.5">Standard work day</h3>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
            Start slot (0–47)
            <input
              type="number"
              min={0}
              max={47}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              className="w-24 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
            End slot (1–48)
            <input
              type="number"
              min={1}
              max={48}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="w-24 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            />
          </label>
          <span className="text-[12px] text-[#898781] pb-2">
            = {slotToTime(start)}–{slotToTime(end)}
          </span>
          <button
            className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1.5 text-[12.5px]"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await updateStandardWorkDay({ startSlot: start, endSlot: end });
                refresh();
              })
            }
          >
            Save
          </button>
        </div>
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
        <h3 className="text-[13.5px] font-semibold mb-2.5">Configure Lead Types</h3>
        <div className="flex flex-col gap-1 mb-3">
          {leadTypes.map((t) => (
            <div key={t.id} className="flex items-center justify-between border border-[#e1e0d9] rounded-md px-2.5 py-1.5">
              <span className="text-[13px]">{t.name}</span>
              <button
                className="text-[#d03b3b] text-[12px]"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeLeadType(t.id, t.name);
                    refresh();
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {leadTypes.length === 0 && <p className="text-[12.5px] text-[#898781]">No lead types yet.</p>}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            placeholder="New lead type"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          />
          <button
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
            disabled={isPending || !newType.trim()}
            onClick={() =>
              startTransition(async () => {
                await addLeadType(newType.trim());
                setNewType("");
                refresh();
              })
            }
          >
            Add
          </button>
        </div>
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
        <h3 className="text-[13.5px] font-semibold mb-1">Allowed sign-in domains</h3>
        <p className="text-[12px] text-[#898781] mb-2.5">
          Only Google accounts on these domains can sign in — enforced server-side, not just in the
          Google account picker.
        </p>
        <div className="flex flex-col gap-1 mb-3">
          {domains.map((d) => (
            <div key={d} className="flex items-center justify-between border border-[#e1e0d9] rounded-md px-2.5 py-1.5">
              <span className="text-[13px]">{d}</span>
              <button
                className="text-[#d03b3b] text-[12px]"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeAllowedDomain(d);
                    refresh();
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {domains.length === 0 && (
            <p className="text-[12.5px] text-[#d03b3b]">
              No domains allowed yet — nobody can sign in until you add one.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            placeholder="yourcompany.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <button
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
            disabled={isPending || !newDomain.trim()}
            onClick={() =>
              startTransition(async () => {
                await addAllowedDomain(newDomain.trim());
                setNewDomain("");
                refresh();
              })
            }
          >
            Add
          </button>
        </div>
      </div>

      <div className="bg-[#fcfcfb] border border-[#e1e0d9] rounded-lg p-4">
        <h3 className="text-[13.5px] font-semibold mb-1">Pre-approved admins</h3>
        <p className="text-[12px] text-[#898781] mb-2.5">
          Emails listed here become role=admin automatically the first time they sign in. You can
          also promote/demote anyone after the fact from the Agents page.
        </p>
        <div className="flex flex-col gap-1 mb-3">
          {adminEmails.map((e) => (
            <div key={e} className="flex items-center justify-between border border-[#e1e0d9] rounded-md px-2.5 py-1.5">
              <span className="text-[13px]">{e}</span>
              <button
                className="text-[#d03b3b] text-[12px]"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeAdminEmail(e);
                    refresh();
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {adminEmails.length === 0 && <p className="text-[12.5px] text-[#898781]">None listed.</p>}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-[#c3c2b7] px-2 py-1.5 text-[13px]"
            placeholder="person@yourcompany.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
          />
          <button
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[13px] font-semibold"
            disabled={isPending || !newAdminEmail.trim()}
            onClick={() =>
              startTransition(async () => {
                await addAdminEmail(newAdminEmail.trim());
                setNewAdminEmail("");
                refresh();
              })
            }
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
