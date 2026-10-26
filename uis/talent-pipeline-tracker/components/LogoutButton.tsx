"use client";

import { useRouter } from "next/navigation";

import { clearToken } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        clearToken();
        router.replace("/login");
      }}
      className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100 focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden dark:border-slate-600 dark:hover:bg-slate-800"
    >
      Cerrar sesión
    </button>
  );
}
