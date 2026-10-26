"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ApiError, resetPassword } from "@/lib/account";

type Field = "password" | "confirm";
type FieldErrors = Partial<Record<Field, string>>;

const INVALID_LINK = "El enlace no es válido o ha caducado.";

// Mismas reglas que la API (8 caracteres como mínimo); el límite de 72 bytes lo valida ella
function validate(password: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.length < 8) errors.password = "La contraseña debe tener al menos 8 caracteres.";
  if (!confirm) errors.confirm = "Repite la contraseña.";
  else if (confirm !== password) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-rose-500";
const errorClass = "mt-1 text-xs text-rose-700";
const linkClass = "font-medium text-[#006992] underline hover:no-underline";

function InvalidLink({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
    >
      <p>{message}</p>
      <p className="mt-2">
        <Link href="/forgot-password" className={linkClass}>
          Solicita un enlace nuevo
        </Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!token) return;
    setApiError(null);
    const found = validate(password, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      router.push("/login?reset=ok");
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setLinkError(true);
      } else if (e instanceof ApiError && e.fieldErrors.new_password) {
        setErrors({ password: e.fieldErrors.new_password });
      } else {
        setApiError(e instanceof Error ? e.message : "Error inesperado.");
      }
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="reset-titulo"
      className="rounded-lg border border-slate-200 bg-white p-6"
    >
      <h1 id="reset-titulo" className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Nueva contraseña
      </h1>

      {!token || linkError ? (
        <div className="mt-6">
          <InvalidLink message={token ? INVALID_LINK : "Falta el token en el enlace."} />
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">Elige una contraseña nueva para tu cuenta.</p>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label htmlFor="reset-password" className="text-sm text-slate-700">
                Nueva contraseña <span aria-hidden="true">*</span>
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "reset-password-error" : "reset-password-hint"
                }
                className={inputClass}
              />
              {errors.password ? (
                <p id="reset-password-error" role="alert" className={errorClass}>
                  {errors.password}
                </p>
              ) : (
                <p id="reset-password-hint" className="mt-1 text-xs text-slate-500">
                  Mínimo 8 caracteres.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reset-confirm" className="text-sm text-slate-700">
                Repite la contraseña <span aria-hidden="true">*</span>
              </label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!errors.confirm}
                aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
                className={inputClass}
              />
              {errors.confirm && (
                <p id="reset-confirm-error" role="alert" className={errorClass}>
                  {errors.confirm}
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
              {submitting ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/login" className={linkClass}>
          Volver a iniciar sesión
        </Link>
      </p>
    </section>
  );
}
