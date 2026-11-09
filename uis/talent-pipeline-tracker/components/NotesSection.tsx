'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Note } from '@/types/record';
import { getNotes, addNote, deleteNote } from '@/services/notes';
import { errorMessage } from '@/services/apiClient';
import { formatDate } from '@/lib/labels';

interface NotesSectionProps {
  recordId: string;
}

export default function NotesSection({ recordId }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getNotes(recordId);
      setNotes(data);
    } catch (err) {
      setError(`No se han podido cargar las notas. ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  // Carga inicial sin setState síncrono en el efecto; el flag evita escribir el
  // estado si cambia recordId o se desmonta antes de que llegue la respuesta
  useEffect(() => {
    let cancelled = false;
    getNotes(recordId)
      .then((data) => {
        if (cancelled) return;
        setNotes(data);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(`No se han podido cargar las notas. ${errorMessage(err)}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  async function handleAdd() {
    const text = content.trim();
    if (text === '') {
      setMessage(null);
      setActionError('La nota no puede estar vacía.');
      return;
    }
    try {
      setAdding(true);
      setMessage(null);
      setActionError(null);
      await addNote(recordId, text);
      setContent('');
      setMessage('Nota añadida.');
      await loadNotes();
    } catch (err) {
      setActionError(`No se ha podido añadir la nota. ${errorMessage(err)}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(noteId: string) {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      setDeletingId(noteId);
      setMessage(null);
      setActionError(null);
      await deleteNote(recordId, noteId);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setMessage('Nota eliminada.');
    } catch (err) {
      setActionError(`No se ha podido eliminar la nota. ${errorMessage(err)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-8">
      <h3 className="text-lg font-bold mb-2">Notas internas</h3>

      {loading && <p>Cargando notas...</p>}
      {error && !loading && (
        <div role="alert" className="text-red-600">
          <p>{error}</p>
          <button onClick={loadNotes} className="mt-2 bg-blue-700 text-white px-4 py-2">
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && notes.length === 0 && (
        <p className="text-sm text-gray-600">Esta candidatura no tiene notas.</p>
      )}

      {!loading && !error && notes.length > 0 && (
        <ul>
          {notes.map((note) => (
            <li key={note.id} className="border-b py-2 flex justify-between gap-4 max-w-2xl">
              <div>
                <p>{note.content}</p>
                <p className="text-xs text-gray-500">{formatDate(note.created_at, true)}</p>
              </div>
              <button onClick={() => handleDelete(note.id)} disabled={deletingId === note.id} className="text-red-600 text-sm hover:underline disabled:opacity-50">
                {deletingId === note.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2 max-w-xl">
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Escribe una nota interna" rows={3} className="border p-2" />
        <button onClick={handleAdd} disabled={adding} className="self-start bg-blue-700 text-white px-4 py-2 disabled:opacity-50">
          {adding ? 'Añadiendo...' : 'Añadir nota'}
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}
    </section>
  );
}

