"use client";

import Link from "next/link";
import { useState } from "react";

import { ApiError, errorMessage, forgotPassword } from "@/lib/account";

// Mismo texto que devuelve la API: no revela si el email está registrado
const SENT_MESSAGE = "Si esa dirección está registrada, recibirás un enlace en breve";

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.fieldErrors.email) return "Introduce un email válido.";
  return errorMessage(e);
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-rose-500 disabled:cursor-not-allowed disabled:bg-slate-100";
const errorClass = "mt-1 text-xs text-rose-700";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setApiError(null);
    if (!email.trim()) {
      setEmailError("El email es obligatorio.");
      return;
    }
    setEmailError(null);

    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setApiError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="forgot-titulo"
      className="rounded-lg border border-slate-200 bg-white p-6"
    >
      <h1 id="forgot-titulo" className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Recuperar contraseña
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Escribe el email de tu cuenta y te enviaremos un enlace para elegir una nueva.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-6 space-y-4"
      >
        {/* Tras enviar se desactiva todo: un único envío por visita */}
        <fieldset disabled={sent || submitting} className="space-y-4">
          <div>
            <label htmlFor="forgot-email" className="text-sm text-slate-700">
              Email <span aria-hidden="true">*</span>
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "forgot-email-error" : undefined}
              className={inputClass}
            />
            {emailError && (
              <p id="forgot-email-error" role="alert" className={errorClass}>
                {emailError}
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
            className="w-full rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] focus:ring-2 focus:ring-[#001D4A] focus:outline-hidden disabled:opacity-50"
          >
            {submitting ? "Enviando…" : sent ? "Enlace solicitado" : "Enviar enlace"}
          </button>
        </fieldset>

        {sent && (
          <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            {SENT_MESSAGE}
          </p>
        )}
      </form>

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/login" className="font-medium text-[#006992] underline hover:no-underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </section>
  );
}
