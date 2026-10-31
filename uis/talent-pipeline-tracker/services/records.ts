import type { RecordFilters, RecordsResponse, TalentRecord } from '@/types/record';
import { apiFetch, readJson } from '@/services/apiClient';

export async function getRecords(filters: RecordFilters = {}): Promise<RecordsResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.stage) params.set('stage', filters.stage);
  if (filters.search) params.set('search', filters.search);
  params.set('limit', String(filters.limit ?? 100));

  const response = await apiFetch(`/records?${params.toString()}`);
  return readJson<RecordsResponse>(response);
}

// Un 404 llega como ApiError con status 404: la página muestra «Esta candidatura no existe»
export async function getRecordById(id: string): Promise<TalentRecord> {
  const response = await apiFetch(`/records/${id}`);
  return readJson<TalentRecord>(response);
}

export async function patchRecord(
  id: string,
  changes: Partial<Pick<TalentRecord, 'status' | 'stage'>>
): Promise<void> {
  await apiFetch(`/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}
