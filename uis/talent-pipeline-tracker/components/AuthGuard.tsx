"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { AuthApiError, getMe, type Me } from "@/lib/authApi";
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
// Un 401 cierra la sesión (lo hace getMe); un fallo de red o del servidor no:
// se explica y se ofrece reintentar, sin perder la sesión.
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const valid = useTokenStatus();
  const [me, setMe] = useState<Me | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [retries, setRetries] = useState(0);

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
      .catch((e) => {
        // El 401 ya redirige a /login desde getMe
        if (!cancelled && !(e instanceof AuthApiError && e.status === 401)) setCheckError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [valid, router, retries]);

  if (checkError) {
    return (
      <main className="p-8">
        <div role="alert" className="max-w-xl rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>No se pudo comprobar la sesión. Revisa tu conexión e inténtalo de nuevo.</p>
          <button
            type="button"
            onClick={() => {
              setCheckError(false);
              setRetries((n) => n + 1);
            }}
            className="mt-3 bg-blue-700 px-4 py-2 text-white"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!valid || !me) {
    return (
      <p role="status" className="p-8 text-sm">
        Comprobando la sesión…
      </p>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}
