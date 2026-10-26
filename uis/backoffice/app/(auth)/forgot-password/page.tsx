import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recuperar contraseña — Nexova Solutions",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
