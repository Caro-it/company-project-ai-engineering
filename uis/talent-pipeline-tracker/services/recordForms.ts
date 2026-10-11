import type { RecordInput, TalentRecord } from '@/types/record';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function createRecord(input: RecordInput): Promise<TalentRecord> {
  const response = await fetch(`${API_URL}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
  return response.json();
}

export async function replaceRecord(id: string, input: RecordInput): Promise<void> {
  const response = await fetch(`${API_URL}/records/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
}

