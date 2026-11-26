// Report selection tokens: "g:<groupId>" (all campaigns in a group) or
// "p:<projectId>" (one campaign). Pure helpers, shared by server and client.
export type GroupLite = { id: string; name: string; projectIds: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseTokens(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^[gp]:/.test(t) && UUID.test(t.slice(2)));
}

// The union of campaign ids the tokens stand for. Unknown groups resolve to nothing.
export function resolveSelection(tokens: string[], groups: GroupLite[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    const id = t.slice(2);
    if (t.startsWith("p:")) out.add(id);
    else for (const p of groups.find((g) => g.id === id)?.projectIds ?? []) out.add(p);
  }
  return Array.from(out);
}
