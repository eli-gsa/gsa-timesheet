"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

const ADMIN_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/team", label: "Agents" },
  { href: "/projects", label: "Projects" },
  { href: "/reports", label: "Reports" },
  { href: "/invoicing", label: "Invoicing" },
  { href: "/audit", label: "Audit log" },
  { href: "/settings", label: "Settings" },
];

const SUMMARY_LINK = { href: "/summary", label: "My Summary" };
const AGENT_LINKS = [{ href: "/timesheet", label: "My Timesheet" }, SUMMARY_LINK];

export default function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  const links = role === "admin" ? ADMIN_LINKS : AGENT_LINKS;

  return (
    <>
      {role === "admin" && (
        <Link
          href="/timesheet"
          className={`text-left rounded-md px-2.5 py-2 text-[13.5px] ${
            pathname === "/timesheet"
              ? "bg-[#e8f0fb] text-[#2a78d6] font-semibold"
              : "text-[#52514e] hover:bg-[#f3f2ee] hover:text-[#0b0b0b]"
          }`}
        >
          My Timesheet
        </Link>
      )}
      {role === "admin" && (
        <Link
          href={SUMMARY_LINK.href}
          className={`text-left rounded-md px-2.5 py-2 text-[13.5px] ${
            pathname === SUMMARY_LINK.href
              ? "bg-[#e8f0fb] text-[#2a78d6] font-semibold"
              : "text-[#52514e] hover:bg-[#f3f2ee] hover:text-[#0b0b0b]"
          }`}
        >
          {SUMMARY_LINK.label}
        </Link>
      )}
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`text-left rounded-md px-2.5 py-2 text-[13.5px] ${
            pathname === l.href
              ? "bg-[#e8f0fb] text-[#2a78d6] font-semibold"
              : "text-[#52514e] hover:bg-[#f3f2ee] hover:text-[#0b0b0b]"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}
