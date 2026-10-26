import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Nueva contraseña — Nexova Solutions",
};

// ResetPasswordForm usa useSearchParams: sin Suspense, el build de producción falla
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-slate-600">
          Cargando…
        </p>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
