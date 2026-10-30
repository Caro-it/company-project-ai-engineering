"use client";

import { useState } from "react";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  COUNTRIES,
  CURRENCY_BY_COUNTRY,
  createSupplier,
  type Category,
  type Country,
  type Currency,
  type Supplier,
  type SupplierStatus,
} from "@/lib/suppliers";
import { ApiError, errorMessage } from "@/lib/account";

const COUNTRY_LABELS: Record<Country, string> = {
  Spain: "España",
  USA: "Estados Unidos",
};

interface FormState {
  name: string;
  country: Country | "";
  currency: Currency | "";
  categories: Category[];
  monthly_rate: string;
  status: SupplierStatus;
  contract_renewal_date: string;
  contact_email: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  country: "",
  currency: "",
  categories: [],
  monthly_rate: "",
  status: "active",
  contract_renewal_date: "",
  contact_email: "",
  notes: "",
};

type RequiredField =
  | "name"
  | "country"
  | "currency"
  | "categories"
  | "monthly_rate";
type FieldErrors = Partial<Record<RequiredField, string>>;

// Validación en cliente: solo los campos requeridos.
// Las reglas de negocio (tarifa > 0, moneda según país) las valida la API y su error se muestra.
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "El nombre es obligatorio.";
  if (!form.country) errors.country = "Elige un país.";
  if (!form.currency) errors.currency = "Elige una moneda.";
  if (form.categories.length === 0)
    errors.categories = "Marca al menos una categoría.";
  if (
    form.monthly_rate.trim() === "" ||
    Number.isNaN(Number(form.monthly_rate))
  ) {
    errors.monthly_rate = "Indica la tarifa mensual.";
  }
  return errors;
}

// Campos del 422 de la API → nombre en el formulario (el msg de Pydantic no se muestra)
const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  country: "País",
  currency: "Moneda",
  categories: "Categorías",
  monthly_rate: "Tarifa mensual (debe ser mayor que 0)",
  status: "Estado",
  contract_renewal_date: "Fecha de renovación",
  contact_email: "Email de contacto",
  notes: "Notas internas",
};

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 422) {
    const fields = Object.keys(e.fieldErrors).map((f) => FIELD_LABELS[f] ?? f);
    // Error de modelo (sin campo concreto): la moneda no corresponde al país
    return fields.length > 0
      ? `Revisa estos campos: ${fields.join(", ")}.`
      : "Revisa los datos: la moneda debe corresponder al país elegido.";
  }
  return errorMessage(e);
}

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
const errorClass = "mt-1 text-xs text-rose-700";

export function SupplierForm({
  onCreated,
}: {
  onCreated: (s: Supplier) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Al elegir país se sugiere su moneda, pero se puede cambiar: la coherencia la valida la API
  function changeCountry(value: Country | "") {
    setForm((prev) => ({
      ...prev,
      country: value,
      currency: value ? CURRENCY_BY_COUNTRY[value] : prev.currency,
    }));
  }

  function toggleCategory(category: Category) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  }

  async function handleSubmit() {
    setApiError(null);
    setSuccess(null);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const created = await createSupplier({
        name: form.name.trim(),
        country: form.country as Country,
        currency: form.currency as Currency,
        categories: form.categories,
        monthly_rate: Number(form.monthly_rate),
        status: form.status,
        contract_renewal_date: form.contract_renewal_date || null,
        contact_email: form.contact_email.trim() || null,
        notes: form.notes.trim() || null,
      });
      onCreated(created);
      setForm(EMPTY_FORM);
      setSuccess(`Proveedor "${created.name}" registrado correctamente.`);
    } catch (e) {
      setApiError(errorText(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="alta-titulo"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="alta-titulo" className="text-sm font-semibold text-[#001D4A]">
          Registrar proveedor
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="form-alta"
          className="rounded-md bg-[#001D4A] px-3 py-2 text-sm font-medium text-white hover:bg-[#002a6b]"
        >
          {open ? "Cerrar formulario" : "+ Nuevo proveedor"}
        </button>
      </div>

      {success && (
        <p
          role="status"
          className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}

      {open && (
        <form
          id="form-alta"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label htmlFor="f-name" className="text-sm text-slate-700">
              Nombre <span aria-hidden="true">*</span>
            </label>
            <input
              id="f-name"
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "f-name-error" : undefined}
              className={inputClass}
            />
            {errors.name && (
              <p id="f-name-error" className={errorClass}>
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="f-country" className="text-sm text-slate-700">
              País <span aria-hidden="true">*</span>
            </label>
            <select
              id="f-country"
              value={form.country}
              onChange={(e) => changeCountry(e.target.value as Country | "")}
              aria-invalid={!!errors.country}
              aria-describedby={errors.country ? "f-country-error" : undefined}
              className={inputClass}
            >
              <option value="">Elige un país</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY_LABELS[c]}
                </option>
              ))}
            </select>
            {errors.country && (
              <p id="f-country-error" className={errorClass}>
                {errors.country}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="f-currency" className="text-sm text-slate-700">
              Moneda <span aria-hidden="true">*</span>
            </label>
            <select
              id="f-currency"
              value={form.currency}
              onChange={(e) =>
                update("currency", e.target.value as Currency | "")
              }
              aria-invalid={!!errors.currency}
              aria-describedby={
                errors.currency ? "f-currency-error" : undefined
              }
              className={inputClass}
            >
              <option value="">Elige una moneda</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
            {errors.currency && (
              <p id="f-currency-error" className={errorClass}>
                {errors.currency}
              </p>
            )}
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm text-slate-700">
              Categorías <span aria-hidden="true">*</span>
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={form.categories.includes(c)}
                    onChange={() => toggleCategory(c)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {CATEGORY_LABELS[c]}
                </label>
              ))}
            </div>
            {errors.categories && (
              <p className={errorClass}>{errors.categories}</p>
            )}
          </fieldset>

          <div>
            <label htmlFor="f-rate" className="text-sm text-slate-700">
              Tarifa mensual <span aria-hidden="true">*</span>
            </label>
            <input
              id="f-rate"
              type="number"
              step="0.01"
              value={form.monthly_rate}
              onChange={(e) => update("monthly_rate", e.target.value)}
              aria-invalid={!!errors.monthly_rate}
              aria-describedby={
                errors.monthly_rate ? "f-rate-error" : undefined
              }
              className={inputClass}
            />
            {errors.monthly_rate && (
              <p id="f-rate-error" className={errorClass}>
                {errors.monthly_rate}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="f-status" className="text-sm text-slate-700">
              Estado
            </label>
            <select
              id="f-status"
              value={form.status}
              onChange={(e) =>
                update("status", e.target.value as SupplierStatus)
              }
              className={inputClass}
            >
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-renewal" className="text-sm text-slate-700">
              Fecha de renovación
            </label>
            <input
              id="f-renewal"
              type="date"
              value={form.contract_renewal_date}
              onChange={(e) => update("contract_renewal_date", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="f-email" className="text-sm text-slate-700">
              Email del account manager
            </label>
            <input
              id="f-email"
              type="email"
              value={form.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="f-notes" className="text-sm text-slate-700">
              Notas internas
            </label>
            <textarea
              id="f-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={inputClass}
            />
          </div>

          {apiError && (
            <p
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2"
            >
              No se pudo registrar el proveedor: {apiError}
            </p>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] disabled:opacity-50"
            >
              {submitting ? "Registrando…" : "Registrar proveedor"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
