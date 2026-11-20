"use client";

import { useEffect } from "react";
import { markHoursSeen } from "@/lib/actions/hours";

// Opening Assigned Hours counts as seeing the change: clears the banner.
export default function MarkSeen({ changedAt }: { changedAt: string | null }) {
  useEffect(() => {
    if (changedAt) void markHoursSeen(changedAt);
  }, [changedAt]);
  return null;
}
