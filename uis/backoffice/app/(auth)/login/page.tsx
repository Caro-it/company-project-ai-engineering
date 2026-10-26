import { LoginForm } from "@/components/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión — Nexova Solutions",
};

// ?reset=ok llega desde /reset-password tras cambiar la contraseña
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reset } = await searchParams;
  return <LoginForm resetOk={reset === "ok"} />;
}
