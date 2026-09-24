import { redirect } from "next/navigation";
import { getCurrentAgent } from "@/lib/data";
import { signOut } from "@/lib/actions/auth";
import NavLinks from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const agent = await getCurrentAgent();

  if (!agent) {
    // Signed in with Google but no agents row (trigger failed, or the row
    // was deleted). Nothing useful to show — send back to login.
    redirect("/login");
  }

  if (!agent.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9f7] px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold mb-2">Account inactive</h1>
          <p className="text-sm text-[#898781]">
            Your account has been archived. Contact your admin if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[#e1e0d9] bg-[#fcfcfb]">
        <div className="flex items-center gap-2 mr-auto">
          <h1 className="text-[15px] font-semibold tracking-tight">GSA Timesheet</h1>
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-[#52514e]">
          <span>
            {agent.name}{" "}
            <span
              className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                agent.role === "admin" ? "bg-[#e8f0fb] text-[#2a78d6]" : "bg-[#ececE6] text-[#52514e]"
              }`}
            >
              {agent.role}
            </span>
          </span>
          <form action={signOut}>
            <button className="rounded-md border border-[#c3c2b7] bg-white px-2.5 py-1 text-[12.5px] hover:bg-[#f3f2ee]">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <nav className="w-[190px] shrink-0 border-r border-[#e1e0d9] bg-[#fcfcfb] p-2.5 flex flex-col gap-0.5 overflow-y-auto">
          <NavLinks role={agent.role} />
        </nav>
        <main className="flex-1 min-w-0 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
