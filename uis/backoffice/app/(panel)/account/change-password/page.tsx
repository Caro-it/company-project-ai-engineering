import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cambiar contraseña — Nexova Solutions",
};

export default function ChangePasswordPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Cambiar contraseña
      </h1>
      <p className="mt-2 text-slate-600">
        Escribe tu contraseña actual y elige una nueva.
      </p>
      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
