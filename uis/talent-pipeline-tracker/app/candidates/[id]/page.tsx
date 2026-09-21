'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TalentRecord } from '@/types/record';
import { getRecordById } from '@/services/records';
import { STATUS_LABELS, STAGE_LABELS } from '@/lib/labels';

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();

  const [record, setRecord] = useState<TalentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="p-8">
      <Link href="/" className="text-blue-700 hover:underline">← Volver al listado</Link>

      {loading && <p className="mt-4">Cargando candidatura…</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

      {record && !loading && !error && (
        <div className="mt-4">
          <h2 className="text-xl font-bold mb-4">{record.full_name}</h2>
          <p>Email: {record.email}</p>
          <p>Teléfono: {record.phone}</p>
          <p>Puesto: {record.position}</p>
          <p>Años de experiencia: {record.experience_years}</p>
          <p>Estado: {STATUS_LABELS[record.status]}</p>
          <p>Etapa: {STAGE_LABELS[record.stage]}</p>
          <p>Fecha de aplicación: {new Date(record.applied_at).toLocaleDateString('es-ES')}</p>
          {record.linkedin_url && (<p><a href={record.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">LinkedIn (URL del perfil)</a></p>)}
          <p><a href={record.cv_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">Enlace al CV</a></p>
        </div>
      )}
    </main>
  );
}