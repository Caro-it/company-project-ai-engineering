// Cliente de la API del directorio de proveedores (services/api/app/routers/suppliers.py).
// Fuente de verdad de campos y valores: docs/CONTEXT-suppliers-nexova.md
// Errores: ApiError de lib/account (texto fijo por status y campos que fallaron en un 422).
import { request } from "@/lib/account";

export const COUNTRIES = ["Spain", "USA"] as const;
export type Country = (typeof COUNTRIES)[number];

export type Currency = "EUR" | "USD";
export const CURRENCY_BY_COUNTRY: Record<Country, Currency> = {
  Spain: "EUR",
  USA: "USD",
};

export const CATEGORIES = [
  "job_boards",
  "ats_software",
  "assessment_tools",
  "training_platforms",
  "payroll_and_hr_software",
  "video_interview",
  "background_check",
  "office_and_facilities",
  "it_and_software_licenses",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  job_boards: "Portales de empleo",
  ats_software: "Software ATS",
  assessment_tools: "Herramientas de evaluación",
  training_platforms: "Plataformas de formación",
  payroll_and_hr_software: "Nóminas y software RR. HH.",
  video_interview: "Videoentrevistas",
  background_check: "Verificación de antecedentes",
  office_and_facilities: "Oficinas e instalaciones",
  it_and_software_licenses: "Licencias IT y software",
};

export type SupplierStatus = "active" | "suspended";

export interface Supplier {
  id: number;
  name: string;
  country: Country;
  categories: Category[];
  monthly_rate: number;
  currency: Currency;
  updated_at: string;
  status: SupplierStatus;
  contract_renewal_date: string | null;
  contact_email: string | null;
  notes: string | null;
}

// Lo que envía el formulario: sin id ni updated_at (los genera el sistema)
export type SupplierCreate = Omit<Supplier, "id" | "updated_at">;

export interface SupplierFilters {
  country?: Country | "";
  category?: Category | "";
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function listSuppliers(
  filters: SupplierFilters = {},
): Promise<Supplier[]> {
  const params = new URLSearchParams();
  if (filters.country) params.set("country", filters.country);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  return request<Supplier[]>(`/suppliers${qs ? `?${qs}` : ""}`);
}

export function createSupplier(data: SupplierCreate): Promise<Supplier> {
  return request<Supplier>("/suppliers", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function updateRate(
  id: number,
  monthly_rate: number,
): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}/rate`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ monthly_rate }),
  });
}

export function updateStatus(
  id: number,
  status: SupplierStatus,
): Promise<Supplier> {
  return request<Supplier>(`/suppliers/${id}/status`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
}

// Días hasta la renovación (negativo si ya pasó). null si no hay fecha.
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
