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
      className="block w-full rounded-md px-3 py-2 text-left text-slate-200 hover:bg-white/5 hover:text-white focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden"
    >
      Cerrar sesión
    </button>
  );
}
