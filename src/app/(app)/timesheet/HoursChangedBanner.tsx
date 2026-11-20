"use client";

import Link from "next/link";
import { useState } from "react";
import { markHoursSeen } from "@/lib/actions/hours";

// "Hours changed" notice on the agent's own timesheet. Stays until closed or
// the agent opens Assigned Hours; either way it is marked seen, so it returns
// only when their hours change again.
export default function HoursChangedBanner({ changedAt }: { changedAt: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    void markHoursSeen(changedAt);
  };
  return (
    <div
      role="status"
      className="relative mb-3 flex items-center gap-3 rounded-lg border border-[#b9d3f3] bg-[#e8f0fb] pl-4 pr-10 py-2.5 text-[13.5px] text-[#1b4f8f]"
    >
      <span className="font-semibold">Hours changed</span>
      <span className="text-[#52514e]">Your assigned hours have been updated.</span>
      <Link
        href="/assigned-hours"
        onClick={dismiss}
        className="ml-auto rounded-md bg-[#2a78d6] px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-[#2269bd]"
      >
        View
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-1.5 h-6 w-6 rounded text-[16px] leading-none text-[#52514e] hover:bg-[#d3e4f8]"
      >
        ×
      </button>
    </div>
  );
}
