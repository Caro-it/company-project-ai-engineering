// Cliente de la API de incidencias (services/api). Los tipos reflejan el JSON de analyze_rows.
import { apiFetch } from "@/lib/api";

export interface IncidentsSummary {
  total_records: number;
  valid_records: number;
  invalid_records: number;
  invalid_by_rule: Record<string, number>;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  satisfaction: {
    closed: number;
    scored: number;
    average: number;
    distribution: Record<string, number>;
  };
}

export interface AnalyzeResponse {
  filename: string;
  summary: IncidentsSummary;
  invalid_rule_labels: Record<string, string>;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // respuesta sin JSON: usamos el mensaje genérico
  }
  return `Error ${res.status} al procesar la petición.`;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new Error(
      "No se pudo conectar con la API. Comprueba que está arrancada en el puerto 8000.",
    );
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res;
}

export async function analyzeIncidents(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await request("/api/incidents/analyze", {
    method: "POST",
    body: form,
  });
  return res.json();
}

export async function downloadResults(): Promise<void> {
  const res = await request("/api/incidents/results/export");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "results.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
