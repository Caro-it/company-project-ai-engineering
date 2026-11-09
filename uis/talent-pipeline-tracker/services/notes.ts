import type { Note } from '@/types/record';
import { apiFetch, readJson } from '@/services/apiClient';

export async function getNotes(recordId: string): Promise<Note[]> {
  const response = await apiFetch(`/records/${recordId}/notes`);
  const data = await readJson<Note[] | { data?: Note[] } | null>(response);
  return Array.isArray(data) ? data : data?.data ?? [];
}

export async function addNote(recordId: string, content: string): Promise<void> {
  await apiFetch(`/records/${recordId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function deleteNote(recordId: string, noteId: string): Promise<void> {
  await apiFetch(`/records/${recordId}/notes/${noteId}`, {
    method: 'DELETE',
  });
}
