"use client";

import Link from "next/link";
import { useState } from "react";

import {
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  IncidentApiError,
  ORIGINS,
  ORIGIN_LABELS,
  STATUS_LABELS,
  createIncident,
  fieldErrorMessage,
  incidentErrorMessage,
  type IncidentBranch,
  type IncidentCategory,
  type IncidentField,
  type IncidentOrigin,
} from "@/lib/incidents";

interface FormState {
  title: string;
  description: string;
  category: IncidentCategory | "";
  origin: IncidentOrigin | "";
  branch: IncidentBranch | "";
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category: "",
  origin: "",
  branch: "",
};

const FIELDS: IncidentField[] = [
  "title",
  "description",
  "category",
  "origin",
  "branch",
];

type FieldErrors = Partial<Record<IncidentField, string>>;

// Validación en cliente: todos los campos son obligatorios.
// Los valores permitidos los vuelve a validar la API y su error se muestra junto al campo.
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) errors.title = "El título es obligatorio.";
  if (!form.description.trim())
    errors.description = "La descripción es obligatoria.";
  if (!form.category) errors.category = "Elige una categoría.";
  if (!form.origin) errors.origin = "Elige un origen.";
  if (!form.branch) errors.branch = "Elige una sede.";
  return errors;
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-invalid:border-rose-500";
const errorClass = "mt-1 text-xs text-rose-700";
const helpClass = "mt-1 text-xs text-slate-500";

// Sedes físicas frente a remote: en grupos separados para que no se confundan
const OFFICE_BRANCHES: IncidentBranch[] = [
  "central",
  "valencia_operations",
  "miami_office",
];

export function IncidentForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // aria-describedby con la ayuda y, si lo hay, el error del campo
  function describedBy(field: IncidentField, ...help: string[]) {
    const ids = [...help, errors[field] ? `f-${field}-error` : ""].filter(
      Boolean,
    );
    return ids.length ? ids.join(" ") : undefined;
  }

  async function handleSubmit() {
    setApiError(null);
    setCreated(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const incident = await createIncident({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category as IncidentCategory,
        origin: form.origin as IncidentOrigin,
        branch: form.branch as IncidentBranch,
      });
      setForm(EMPTY_FORM);
      setCreated(incident.title);
    } catch (e) {
      // Los errores con "field" van junto a su campo; el resto, en el aviso general
      const byField: FieldErrors = {};
      if (e instanceof IncidentApiError) {
        for (const err of e.errors) {
          if ((FIELDS as string[]).includes(err.field)) {
            byField[err.field as IncidentField] = fieldErrorMessage(err);
          }
        }
      }
      setErrors(byField);
      if (Object.keys(byField).length === 0) {
        setApiError(incidentErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fromBranch = form.origin === "branch";

  return (
    <section
      aria-labelledby="alta-incidencia-titulo"
      className="rounded-lg border border-slate-200 bg-white p-5"
    >
      <h2
        id="alta-incidencia-titulo"
        className="text-base font-semibold text-[#001D4A]"
      >
        Datos de la incidencia
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Todos los campos son obligatorios. La incidencia se registra como «
        {STATUS_LABELS.open}».
      </p>

      {created && (
        <div
          role="status"
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <p>
            Incidencia «{created}» registrada correctamente con estado «
            {STATUS_LABELS.open}».
          </p>
          <Link
            href="/incidencias"
            className="mt-1 inline-block font-medium underline underline-offset-2"
          >
            Ver el listado de incidencias
          </Link>
        </div>
      )}

      <form
        noValidate
        aria-busy={submitting}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label htmlFor="f-title" className="text-sm text-slate-700">
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="f-title"
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            aria-invalid={!!errors.title}
            aria-describedby={describedBy("title")}
            className={inputClass}
          />
          {errors.title && (
            <p id="f-title-error" role="alert" className={errorClass}>
              {errors.title}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="f-description" className="text-sm text-slate-700">
            Descripción <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="f-description"
            rows={4}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            aria-invalid={!!errors.description}
            aria-describedby={describedBy("description")}
            className={inputClass}
          />
          {errors.description && (
            <p id="f-description-error" role="alert" className={errorClass}>
              {errors.description}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="f-category" className="text-sm text-slate-700">
            Categoría <span aria-hidden="true">*</span>
          </label>
          <select
            id="f-category"
            value={form.category}
            onChange={(e) =>
              update("category", e.target.value as IncidentCategory | "")
            }
            aria-invalid={!!errors.category}
            aria-describedby={describedBy("category")}
            className={inputClass}
          >
            <option value="">Elige una categoría</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          {errors.category && (
            <p id="f-category-error" role="alert" className={errorClass}>
              {errors.category}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="f-origin" className="text-sm text-slate-700">
            Origen <span aria-hidden="true">*</span>
          </label>
          <select
            id="f-origin"
            value={form.origin}
            onChange={(e) =>
              update("origin", e.target.value as IncidentOrigin | "")
            }
            aria-invalid={!!errors.origin}
            aria-describedby={describedBy("origin")}
            className={inputClass}
          >
            <option value="">Elige un origen</option>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {ORIGIN_LABELS[o]}
              </option>
            ))}
          </select>
          {errors.origin && (
            <p id="f-origin-error" role="alert" className={errorClass}>
              {errors.origin}
            </p>
          )}
        </div>

        {/* Sede: siempre visible y obligatoria. Si la reporta una sede, se resalta */}
        <div
          data-highlighted={fromBranch || undefined}
          className={`sm:col-span-2 ${
            fromBranch
              ? "rounded-md border-2 border-[#ECA400] bg-amber-50 p-3"
              : ""
          }`}
        >
          <label htmlFor="f-branch" className="text-sm text-slate-700">
            Sede <span aria-hidden="true">*</span>
          </label>
          {fromBranch && (
            <p
              id="f-branch-origin-help"
              className="mt-1 text-sm font-medium text-amber-900"
            >
              Estás reportando desde una sede: indica en cuál se ha producido la
              incidencia.
            </p>
          )}
          <select
            id="f-branch"
            value={form.branch}
            onChange={(e) =>
              update("branch", e.target.value as IncidentBranch | "")
            }
            aria-invalid={!!errors.branch}
            aria-describedby={describedBy(
              "branch",
              fromBranch ? "f-branch-origin-help" : "",
              "f-branch-help",
            )}
            className={inputClass}
          >
            <option value="">Elige una sede</option>
            <optgroup label="Oficinas de Nexova">
              {OFFICE_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {BRANCH_LABELS[b]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sin oficina">
              <option value="remote">{BRANCH_LABELS.remote}</option>
            </optgroup>
          </select>
          <p id="f-branch-help" className={helpClass}>
            «{BRANCH_LABELS.central}» es la sede central (úsala también si la
            incidencia no corresponde a una oficina concreta); «
            {BRANCH_LABELS.valencia_operations}» es la oficina operativa; «
            {BRANCH_LABELS.remote}» es para quien no trabaja en ninguna oficina.
          </p>
          {errors.branch && (
            <p id="f-branch-error" role="alert" className={errorClass}>
              {errors.branch}
            </p>
          )}
        </div>

        {apiError && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2"
          >
            {apiError}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] focus:ring-2 focus:ring-[#001D4A] focus:outline-hidden disabled:opacity-50"
          >
            {submitting ? "Registrando…" : "Registrar incidencia"}
          </button>
        </div>
      </form>
    </section>
  );
}
