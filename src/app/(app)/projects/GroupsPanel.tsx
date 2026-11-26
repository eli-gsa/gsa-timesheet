"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchMultiSelect from "@/components/SearchMultiSelect";
import { useBusyTransition } from "@/components/BusyOverlay";
import { createGroup, deleteGroup, updateGroup } from "@/lib/actions/groups";
import type { CampaignGroup } from "@/lib/hoursData";

type P = { id: string; name: string; active: boolean };

// Campaign groups: named sets of campaigns that Reports can combine.
export default function GroupsPanel({ projects, groups }: { projects: P[]; groups: CampaignGroup[] }) {
  const router = useRouter();
  const [, startTransition] = useBusyTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const options = projects.map((p) => ({ id: p.id, label: p.name, hint: p.active ? undefined : "archived" }));

  function begin(g: CampaignGroup | null) {
    setEditing(g ? g.id : "new");
    setName(g ? g.name : "");
    setIds(g ? g.projectIds : []);
    setErr(null);
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        if (editing === "new") await createGroup(name, ids);
        else if (editing) await updateGroup(editing, name, ids);
        setEditing(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function remove(id: string) {
    setErr(null);
    startTransition(async () => {
      try {
        await deleteGroup(id);
        setConfirmDel(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <section className="mb-5 rounded-lg border border-[#e1e0d9] bg-white">
      <header className="flex items-center gap-2 px-3.5 py-2.5">
        <button onClick={() => setOpen(!open)} className="text-[12px] w-4 text-[#52514e]" aria-label="Toggle">
          {open ? "▾" : "▸"}
        </button>
        <h3 className="text-[14px] font-semibold mr-auto">
          Campaign groups <span className="text-[12px] font-normal text-[#898781]">({groups.length}) · combine campaigns in Reports</span>
        </h3>
        {open && editing === null && (
          <button
            onClick={() => begin(null)}
            className="rounded-md bg-[#2a78d6] text-white px-3 py-1 text-[12.5px] font-semibold"
          >
            + New group
          </button>
        )}
      </header>

      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
          {err && <div className="rounded-md border border-[#e5b3ad] bg-[#fbeceb] px-3 py-2 text-[13px] text-[#8a1f17]">{err}</div>}

          {editing !== null && (
            <div className="border border-[#e1e0d9] rounded-lg p-3 bg-[#f3f2ee] flex flex-col gap-2.5">
              <label className="flex flex-col gap-1 text-[12px] text-[#52514e]">
                Group name
                <input
                  className="rounded-md border border-[#c3c2b7] bg-white px-2 py-1.5 text-[13px] max-w-[320px]"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="text-[12px] text-[#52514e]">
                Campaigns in this group
                <div className="mt-1">
                  <SearchMultiSelect
                    width={420}
                    options={options}
                    selected={ids}
                    onChange={setIds}
                    placeholder="Select campaigns…"
                    allLabel="campaigns"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!name.trim() || ids.length === 0}
                  onClick={save}
                  className="rounded-md bg-[#2a78d6] text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
                >
                  {editing === "new" ? "Create group" : "Save"}
                </button>
                <button onClick={() => setEditing(null)} className="rounded-md border border-[#c3c2b7] bg-white px-3 py-1.5 text-[12.5px]">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {groups.length === 0 && editing === null && (
            <p className="text-[13px] text-[#898781]">No groups yet. A group lets you report on several campaigns together.</p>
          )}
          {groups.map((g) => (
            <div key={g.id} className="flex items-start gap-3 rounded-md border border-[#f0efe9] px-3 py-2">
              <div className="mr-auto min-w-0">
                <div className="text-[13.5px] font-semibold">{g.name}</div>
                <div className="text-[12.5px] text-[#52514e] mt-0.5">
                  {g.projectIds.length === 0
                    ? "No campaigns"
                    : g.projectIds
                        .map((i) => nameOf.get(i) ?? "?")
                        .sort((a, b) => a.localeCompare(b))
                        .join(", ")}
                </div>
              </div>
              <button onClick={() => begin(g)} className="text-[12.5px] text-[#2a78d6] hover:underline">
                Edit
              </button>
              {confirmDel === g.id ? (
                <button onClick={() => remove(g.id)} className="text-[12.5px] text-[#c0392b] font-semibold">
                  Delete group?
                </button>
              ) : (
                <button onClick={() => setConfirmDel(g.id)} className="text-[12.5px] text-[#8a1f17] hover:underline">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
