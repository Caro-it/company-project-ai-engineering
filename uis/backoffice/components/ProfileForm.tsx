"use client";

import { useEffect, useState } from "react";

import { errorMessage, getMe, updateMyProfile, type ProfileData } from "@/lib/account";

type Field = keyof ProfileData;
type FormState = Record<Field, string>;

const FIELDS: { key: Field; label: string; type: string; autoComplete: string }[] = [
  { key: "name", label: "Nombre", type: "text", autoComplete: "name" },
  { key: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { key: "address", label: "Dirección", type: "text", autoComplete: "street-address" },
];

function toForm(profile: ProfileData | null): FormState {
  return {
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
  };
}

const baseInputClass = "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const inputClass = `${baseInputClass} bg-white`;
// Solo lectura: aspecto bloqueado (sin bg-white, que chocaría con bg-slate-100)
const readOnlyInputClass = `${baseInputClass} cursor-not-allowed bg-slate-100 text-slate-600`;

export function ProfileForm() {
  const [email, setEmail] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(toForm(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        setEmail(me?.email ?? null);
        setForm(toForm(me?.profile ?? null));
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function reload() {
    setLoading(true);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }

  async function handleSubmit() {
    setSaveError(null);
    setSuccess(null);
    setSaving(true);
    try {
      // Un campo vacío se envía como null: la API lo vacía
      const saved = await updateMyProfile({
        name: form.name.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      setForm(toForm(saved));
      setSuccess("Perfil guardado correctamente.");
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-sm text-slate-600">
        Cargando tu perfil…
      </p>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
      >
        <span>No se pudo cargar tu perfil. {loadError}</span>
        <button
          type="button"
          onClick={reload}
          className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="perfil-titulo"
      className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6"
    >
      <h2 id="perfil-titulo" className="text-sm font-semibold text-[#001D4A]">
        Datos de la cuenta
      </h2>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label htmlFor="profile-email" className="text-sm text-slate-700">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={email ?? ""}
            readOnly
            aria-describedby="profile-email-hint"
            className={readOnlyInputClass}
          />
          <p id="profile-email-hint" className="mt-1 text-xs text-slate-500">
            El email no se puede cambiar desde aquí.
          </p>
        </div>

        {FIELDS.map(({ key, label, type, autoComplete }) => (
          <div key={key} className={key === "address" ? "sm:col-span-2" : undefined}>
            <label htmlFor={`profile-${key}`} className="text-sm text-slate-700">
              {label}
            </label>
            <input
              id={`profile-${key}`}
              type={type}
              autoComplete={autoComplete}
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              className={inputClass}
            />
          </div>
        ))}

        {success && (
          <p
            role="status"
            className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2"
          >
            {success}
          </p>
        )}

        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2"
          >
            No se pudo guardar el perfil: {saveError}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
}
