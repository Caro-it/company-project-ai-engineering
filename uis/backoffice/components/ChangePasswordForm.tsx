"use client";

import { useState } from "react";

import { ApiError, changePassword } from "@/lib/account";

type Field = "current" | "password" | "confirm";
type FieldErrors = Partial<Record<Field, string>>;
type FormState = Record<Field, string>;

const EMPTY: FormState = { current: "", password: "", confirm: "" };

const FIELDS: { key: Field; label: string; autoComplete: string; hint?: string }[] = [
  { key: "current", label: "Contraseña actual", autoComplete: "current-password" },
  { key: "password", label: "Nueva contraseña", autoComplete: "new-password", hint: "Mínimo 8 caracteres." },
  { key: "confirm", label: "Repite la nueva contraseña", autoComplete: "new-password" },
];

// Mismas reglas que la API (8 caracteres como mínimo); el límite de 72 bytes lo valida ella
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.current) errors.current = "La contraseña actual es obligatoria.";
  if (form.password.length < 8) errors.password = "La contraseña debe tener al menos 8 caracteres.";
  if (!form.confirm) errors.confirm = "Repite la nueva contraseña.";
  else if (form.confirm !== form.password) errors.confirm = "Las contraseñas no coinciden.";
  return errors;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-rose-500";
const errorClass = "mt-1 text-xs text-rose-700";

export function ChangePasswordForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaveError(null);
    setSuccess(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      setSuccess(await changePassword(form.current, form.password));
      setForm(EMPTY);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setErrors({ current: e.message });
      } else if (e instanceof ApiError && e.fieldErrors.new_password) {
        setErrors({ password: e.fieldErrors.new_password });
      } else {
        setSaveError(e instanceof Error ? e.message : "Error inesperado.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="password-titulo"
      className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="password-titulo" className="text-sm font-semibold text-[#001D4A]">
        Contraseña de la cuenta
      </h2>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-4 grid gap-4 sm:max-w-md"
      >
        {FIELDS.map(({ key, label, autoComplete, hint }) => {
          const error = errors[key];
          const describedBy = error
            ? `change-${key}-error`
            : hint
              ? `change-${key}-hint`
              : undefined;
          return (
            <div key={key}>
              <label htmlFor={`change-${key}`} className="text-sm text-slate-700">
                {label} <span aria-hidden="true">*</span>
              </label>
              <input
                id={`change-${key}`}
                type="password"
                autoComplete={autoComplete}
                required
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                aria-invalid={!!error}
                aria-describedby={describedBy}
                className={inputClass}
              />
              {error ? (
                <p id={`change-${key}-error`} role="alert" className={errorClass}>
                  {error}
                </p>
              ) : (
                hint && (
                  <p id={`change-${key}-hint`} className="mt-1 text-xs text-slate-500">
                    {hint}
                  </p>
                )
              )}
            </div>
          );
        })}

        {success && (
          <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </p>
        )}

        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            No se pudo cambiar la contraseña: {saveError}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </section>
  );
}
