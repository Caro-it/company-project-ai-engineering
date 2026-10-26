"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useTokenStatus } from "@/lib/useTokenStatus";

// Protección en cliente (el token vive en localStorage, que el servidor no ve).
// No muestra nada hasta comprobar el token; sin token válido, manda a /login.
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const valid = useTokenStatus();

  useEffect(() => {
    if (valid === false) router.replace("/login");
  }, [valid, router]);

  if (!valid) {
    return (
      <p role="status" className="sr-only">
        Comprobando la sesión…
      </p>
    );
  }
  return children;
}
