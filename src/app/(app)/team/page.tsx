import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/data";
import type { Agent } from "@/lib/types";
import TeamTable from "./TeamTable";

export default async function TeamPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: agents } = await supabase.from("agents").select("*").order("name");

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[19px] font-semibold">Agents</h2>
        <p className="text-[12.5px] text-[#898781] mt-1">
          Anyone who has signed in with a Workspace Google account appears here automatically.
          To add someone new, create their email on Google Workspace — they&rsquo;ll show up
          the first time they sign in.
        </p>
      </div>
      <TeamTable agents={(agents as Agent[]) ?? []} />
    </div>
  );
}
