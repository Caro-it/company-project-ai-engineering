import type { Note } from '@/types/record';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export async function getNotes(recordId: string): Promise<Note[]> {
  const response = await fetch(`${API_URL}/records/${recordId}/notes`);
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function addNote(recordId: string, content: string): Promise<void> {
  const response = await fetch(`${API_URL}/records/${recordId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
}

export async function deleteNote(recordId: string, noteId: string): Promise<void> {
  const response = await fetch(`${API_URL}/records/${recordId}/notes/${noteId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
}
