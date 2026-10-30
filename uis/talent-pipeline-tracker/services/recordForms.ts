import type { RecordInput, TalentRecord } from '@/types/record';
import { apiFetch, readJson } from '@/services/apiClient';

export async function createRecord(input: RecordInput): Promise<TalentRecord> {
  const response = await apiFetch('/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<TalentRecord>(response);
}

export async function replaceRecord(id: string, input: RecordInput): Promise<void> {
  await apiFetch(`/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
