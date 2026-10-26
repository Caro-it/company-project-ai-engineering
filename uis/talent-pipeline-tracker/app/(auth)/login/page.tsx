import { LoginForm } from "@/components/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión — Talent Pipeline Tracker",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}
