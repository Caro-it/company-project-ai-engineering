import { ProfileForm } from "@/components/ProfileForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi perfil — Nexova Solutions",
};

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Mi perfil
      </h1>
      <p className="mt-2 text-slate-600">
        Consulta el email de tu cuenta y actualiza tus datos de contacto.
      </p>
      <div className="mt-6">
        <ProfileForm />
      </div>
    </div>
  );
}
