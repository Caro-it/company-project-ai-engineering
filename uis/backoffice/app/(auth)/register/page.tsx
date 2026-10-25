import { RegisterForm } from "@/components/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crear cuenta — Nexova Solutions",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
