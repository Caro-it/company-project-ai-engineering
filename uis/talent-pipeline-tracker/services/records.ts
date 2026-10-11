import type { RecordFilters, RecordsResponse, TalentRecord } from '@/types/record';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getRecords(filters: RecordFilters = {}): Promise<RecordsResponse> {
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

export async function getRecordById(id: string): Promise<TalentRecord> {
  const response = await fetch(`${API_URL}/records/${id}`);
  if (!response.ok) {
    throw new Error('No se ha podido cargar la candidatura.');
  }
  return response.json();
}

export async function patchRecord(
  id: string,
  changes: Partial<Pick<TalentRecord, 'status' | 'stage'>>
): Promise<void> {
  const response = await fetch(`${API_URL}/records/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
}
