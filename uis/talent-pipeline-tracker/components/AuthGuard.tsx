"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { clearToken } from "@/lib/auth";
import { getMe, type Me } from "@/lib/authApi";
import { useTokenStatus } from "@/lib/useTokenStatus";

const MeContext = createContext<Me | null>(null);

// Usuario confirmado por la API. Solo se puede usar dentro de AuthGuard.
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe se usa fuera de AuthGuard");
  return me;
}

// Protección en cliente (el token vive en localStorage, que el servidor no ve).
// Primero mira exp en local y, si vale, lo confirma una vez con GET /auth/me.
// No muestra nada hasta tener la respuesta; si algo falla, manda a /login.
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const valid = useTokenStatus();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (valid === null) return;
    if (!valid) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    getMe()
      .then((user) => {
        if (!cancelled) setMe(user);
      })
      .catch(() => {
        if (cancelled) return;
        // Se borra también ante un fallo de red: si no, /login vería un token
        // con exp válido y devolvería a "/" en bucle
        clearToken();
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [valid, router]);

  if (!valid || !me) {
    return (
      <p role="status" className="sr-only">
        Comprobando la sesión…
      </p>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
