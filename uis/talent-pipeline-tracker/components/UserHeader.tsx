"use client";

import { useMe } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";

export function UserHeader() {
  const me = useMe();

  return (
    <header className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 px-8 py-3 text-sm dark:border-slate-700">
      <p>
        <span className="sr-only">Sesión iniciada como </span>
        <span className="font-medium">{me.email}</span>
      </p>
      <LogoutButton />
    </header>
  );
}
