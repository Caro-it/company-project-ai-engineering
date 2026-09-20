import type { RecordFilters, RecordsResponse } from '@/types/record';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Obtiene el listado de candidaturas.
 * Los filtros viajan como query params — la API filtra, no el cliente.
 */
export async function getRecords(
  filters: RecordFilters = {}
): Promise<RecordsResponse> {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.stage) params.set('stage', filters.stage);
  if (filters.search) params.set('search', filters.search);
  params.set('limit', String(filters.limit ?? 100));

  const response = await fetch(`${API_URL}/records?${params.toString()}`);

  if (!response.ok) {
    throw new Error('No se han podido cargar las candidaturas.');
  }

  return response.json();
}