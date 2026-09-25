"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Equivalent of the prototype's gotoAgent()/gotoProject(): when a modal link
// elsewhere in the app navigates here with ?highlight=<id>, scroll that row
// into view and flash it, then strip the param from the URL.
export function useRowHighlight(selectorAttr: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const highlight = searchParams.get("highlight");

  useEffect(() => {
    if (!highlight) return;
    const row = document.querySelector<HTMLElement>(`[${selectorAttr}="${CSS.escape(highlight)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center" });
    row.classList.add("flash-row");
    const t = setTimeout(() => row.classList.remove("flash-row"), 1500);

    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("highlight");
    const next = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;
    router.replace(next, { scroll: false });

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);
}
