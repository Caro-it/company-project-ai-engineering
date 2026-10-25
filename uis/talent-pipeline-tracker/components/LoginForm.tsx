"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { setToken } from "@/lib/auth";
import { login } from "@/lib/authApi";
import { useTokenStatus } from "@/lib/useTokenStatus";

// El registro solo existe en el backoffice: localStorage es por origen,
// así que después hay que iniciar sesión también aquí
const REGISTER_URL = "http://localhost:3001/register";

type Field = "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "El email es obligatorio.";
  if (!password) errors.password = "La contraseña es obligatoria.";
  return errors;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 aria-invalid:border-rose-500";
const errorClass = "mt-1 text-xs text-rose-700";

export function LoginForm() {
  const router = useRouter();
  const hasSession = useTokenStatus();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hasSession) router.replace("/");
  }, [hasSession, router]);

  async function handleSubmit() {
    setApiError(null);
    const found = validate(email, password);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      setToken(await login(email.trim(), password));
      router.replace("/");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Error inesperado.");
      setSubmitting(false);
    }
  }

  // Sin comprobar aún la sesión, o con sesión (redirigiendo), no se muestra el formulario
  if (hasSession !== false) return null;

  return (
    <section
      aria-labelledby="login-titulo"
      className="rounded-lg border border-slate-200 bg-white p-6 text-slate-800"
    >
      <h1 id="login-titulo" className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Iniciar sesión
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Accede al Talent Pipeline Tracker con tu cuenta de Nexova.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-6 space-y-4"
      >
        <div>
          <label htmlFor="login-email" className="text-sm text-slate-700">
            Email <span aria-hidden="true">*</span>
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            className={inputClass}
          />
          {errors.email && (
            <p id="login-email-error" role="alert" className={errorClass}>
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="login-password" className="text-sm text-slate-700">
            Contraseña <span aria-hidden="true">*</span>
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            className={inputClass}
          />
          {errors.password && (
            <p id="login-password-error" role="alert" className={errorClass}>
              {errors.password}
            </p>
          )}
        </div>

        {apiError && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {apiError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] focus:ring-2 focus:ring-[#001D4A] focus:outline-hidden disabled:opacity-50"
        >
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        ¿No tienes cuenta?{" "}
        <a href={REGISTER_URL} className="font-medium text-blue-700 underline hover:no-underline">
          Regístrate en el backoffice
        </a>
      </p>
    </section>
  );
}
