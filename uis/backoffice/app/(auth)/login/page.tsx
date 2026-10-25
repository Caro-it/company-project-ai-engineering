import { LoginForm } from "@/components/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión — Nexova Solutions",
};

export default function LoginPage() {
  return <LoginForm />;
}
