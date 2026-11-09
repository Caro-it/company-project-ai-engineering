'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TalentRecord, RecordStatus, RecordStage } from '@/types/record';
import { getRecordById, patchRecord } from '@/services/records';
import { ApiError, errorMessage } from '@/services/apiClient';
import { STATUS_LABELS, STAGE_LABELS, formatDate } from '@/lib/labels';
import NotesSection from '@/components/NotesSection';

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();

  const [record, setRecord] = useState<TalentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retries, setRetries] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const data = await getRecordById(id);
        if (!cancelled) setRecord(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(`No se ha podido cargar la candidatura. ${errorMessage(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, retries]);

  async function handleUpdate(changes: { status?: RecordStatus; stage?: RecordStage }) {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      await patchRecord(id, changes);
    } catch (err) {
      setSaveError(`No se han podido guardar los cambios. ${errorMessage(err)}`);
      setSaving(false);
      return;
    }
    // El PATCH ya se ha aplicado: si falla la recarga, no se dice que no se guardó
    try {
      setRecord(await getRecordById(id));
      setSaveMessage('Cambios guardados.');
    } catch {
      setSaveMessage('Cambios guardados; no se ha podido refrescar la ficha. Recarga la página.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-8">
      <Link href="/" className="text-blue-700 hover:underline">&larr; Volver al listado</Link>

      {loading && <p className="mt-4">Cargando candidatura...</p>}
      {notFound && !loading && (
        <p role="alert" className="mt-4 text-red-600">
          Esta candidatura no existe.{' '}
          <Link href="/" className="text-blue-700 hover:underline">Volver al listado</Link>
        </p>
      )}
      {error && !loading && (
        <div role="alert" className="mt-4 text-red-600">
          <p>{error}</p>
          <button onClick={() => setRetries((n) => n + 1)} className="mt-2 bg-blue-700 text-white px-4 py-2">
            Reintentar
          </button>
        </div>
      )}

      {record && !loading && !error && !notFound && (
        <div className="mt-4">
          <h2 className="text-xl font-bold mb-4">{record.full_name}</h2>
          <p>Email: {record.email}</p>
          <p>Teléfono: {record.phone}</p>
          <p>Puesto: {record.position}</p>
          <p>Años de experiencia: {record.experience_years}</p>
          <p>Fecha de aplicación: {formatDate(record.applied_at)}</p>
          {record.linkedin_url && (<p><a href={record.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">LinkedIn (URL del perfil)</a></p>)}
          {record.cv_url && (<p><a href={record.cv_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Enlace al CV</a></p>)}

          <div className="flex gap-4 mt-6">
            <label className="flex flex-col text-sm">
              Estado
              <select value={record.status} disabled={saving} onChange={(e) => handleUpdate({ status: e.target.value as RecordStatus })} className="border p-2">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              Etapa
              <select value={record.stage} disabled={saving} onChange={(e) => handleUpdate({ stage: e.target.value as RecordStage })} className="border p-2">
                {Object.entries(STAGE_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
              </select>
            </label>
          </div>

          {saving && <p className="mt-2 text-sm">Guardando...</p>}
          {saveMessage && <p className="mt-2 text-sm text-green-700">{saveMessage}</p>}
          {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
          <p className="mt-6"><Link href={`/candidates/${record.id}/edit`} className="text-blue-700 hover:underline">Editar datos de la candidatura</Link></p>
          <NotesSection recordId={record.id} />
        </div>
      )}
    </main>
  );
}
