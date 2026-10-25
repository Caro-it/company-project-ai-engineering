'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TalentRecord, RecordStatus, RecordStage } from '@/types/record';
import { getRecordById, patchRecord } from '@/services/records';
import { STATUS_LABELS, STAGE_LABELS } from '@/lib/labels';
import NotesSection from '@/components/NotesSection';

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();

  const [record, setRecord] = useState<TalentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getRecordById(id);
        setRecord(data);
      } catch {
        setError('No se ha podido cargar la candidatura.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleUpdate(changes: { status?: RecordStatus; stage?: RecordStage }) {
    try {
      setSaving(true);
      setSaveMessage(null);
      setSaveError(null);
      await patchRecord(id, changes);
      const fresh = await getRecordById(id);
      setRecord(fresh);
      setSaveMessage('Cambios guardados.');
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setSaveError(`No se han podido guardar los cambios. ${detail}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-8">
      <Link href="/" className="text-blue-700 hover:underline">&larr; Volver al listado</Link>

      {loading && <p className="mt-4">Cargando candidatura...</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

      {record && !loading && !error && (
        <div className="mt-4">
          <h2 className="text-xl font-bold mb-4">{record.full_name}</h2>
          <p>Email: {record.email}</p>
          <p>Teléfono: {record.phone}</p>
          <p>Puesto: {record.position}</p>
          <p>Años de experiencia: {record.experience_years}</p>
          <p>Fecha de aplicación: {new Date(record.applied_at).toLocaleDateString('es-ES')}</p>
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






