"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden ${
        active
          ? "bg-white/10 font-semibold text-white"
          : "text-slate-200 hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
