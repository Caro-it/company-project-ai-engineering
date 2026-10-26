"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, login, registerUser } from "@/lib/account";
import { setToken } from "@/lib/auth";
import { useTokenStatus } from "@/lib/useTokenStatus";

// Mismo mínimo que la API (Password en services/api/app/auth_models.py)
const PASSWORD_MIN_LENGTH = 8;

const FIELDS = ["email", "password", "name", "phone", "address"] as const;
type Field = (typeof FIELDS)[number];
type FormState = Record<Field, string>;
type FieldErrors = Partial<Record<Field, string>>;

const EMPTY_FORM: FormState = { email: "", password: "", name: "", phone: "", address: "" };

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.email.trim()) errors.email = "El email es obligatorio.";
  if (form.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return errors;
}

function isField(key: string): key is Field {
  return (FIELDS as readonly string[]).includes(key);
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-rose-500";
const errorClass = "mt-1 text-xs text-rose-700";

const LABELS: Record<Field, string> = {
  email: "Email",
  password: "Contraseña",
  name: "Nombre",
  phone: "Teléfono",
  address: "Dirección",
};

const INPUT_PROPS: Record<Field, { type: string; autoComplete: string }> = {
  email: { type: "email", autoComplete: "email" },
  password: { type: "password", autoComplete: "new-password" },
  name: { type: "text", autoComplete: "name" },
  phone: { type: "tel", autoComplete: "tel" },
  address: { type: "text", autoComplete: "street-address" },
};

const REQUIRED: Field[] = ["email", "password"];

export function RegisterForm() {
  const router = useRouter();
  const hasSession = useTokenStatus();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hasSession) router.replace("/");
  }, [hasSession, router]);

  function update(key: Field, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setApiError(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const email = form.email.trim();
    setSubmitting(true);
    try {
      await registerUser({
        email,
        password: form.password,
        name: form.name.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErrors({ email: "Ya existe una cuenta con este email." });
      } else if (e instanceof ApiError && e.status === 422) {
        const fieldErrors: FieldErrors = {};
        for (const [key, msg] of Object.entries(e.fieldErrors)) {
          if (isField(key)) fieldErrors[key] = msg;
        }
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) setApiError(e.message);
      } else {
        setApiError(e instanceof Error ? e.message : "Error inesperado.");
      }
      setSubmitting(false);
      return;
    }

    // Cuenta creada: se inicia sesión con las mismas credenciales
    try {
      setToken(await login(email, form.password));
      router.replace("/");
    } catch {
      setApiError("La cuenta se ha creado, pero no se ha podido iniciar sesión. Inténtalo desde la página de acceso.");
      setSubmitting(false);
    }
  }

  // Sin comprobar aún la sesión, o con sesión (redirigiendo), no se muestra el formulario
  if (hasSession !== false) return null;

  return (
    <section
      aria-labelledby="registro-titulo"
      className="rounded-lg border border-slate-200 bg-white p-6"
    >
      <h1 id="registro-titulo" className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Crear cuenta
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Los campos marcados con <span aria-hidden="true">*</span>
        <span className="sr-only">asterisco</span> son obligatorios.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-6 space-y-4"
      >
        {FIELDS.map((field) => {
          const id = `register-${field}`;
          const required = REQUIRED.includes(field);
          const hint = field === "password" ? `${id}-hint` : undefined;
          const error = errors[field] ? `${id}-error` : undefined;
          const describedBy = [hint, error].filter(Boolean).join(" ") || undefined;
          return (
            <div key={field}>
              <label htmlFor={id} className="text-sm text-slate-700">
                {LABELS[field]} {required && <span aria-hidden="true">*</span>}
              </label>
              <input
                id={id}
                {...INPUT_PROPS[field]}
                required={required}
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                aria-invalid={!!errors[field]}
                aria-describedby={describedBy}
                className={inputClass}
              />
              {hint && (
                <p id={hint} className="mt-1 text-xs text-slate-500">
                  Mínimo {PASSWORD_MIN_LENGTH} caracteres.
                </p>
              )}
              {errors[field] && (
                <p id={error} role="alert" className={errorClass}>
                  {errors[field]}
                </p>
              )}
            </div>
          );
        })}

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
          {submitting ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-[#006992] underline hover:no-underline">
          Inicia sesión
        </Link>
      </p>
    </section>
  );
}
