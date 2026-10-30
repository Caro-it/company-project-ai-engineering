'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RecordInput } from '@/types/record';
import { getRecordById } from '@/services/records';
import { replaceRecord } from '@/services/recordForms';
import { ApiError, errorMessage } from '@/services/apiClient';
import RecordForm from '@/components/RecordForm';

export default function EditCandidate() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [values, setValues] = useState<RecordInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);
        const data = await getRecordById(id);
        if (cancelled) return;
        setValues({
          full_name: data?.full_name ?? '',
          email: data?.email ?? '',
          phone: data?.phone ?? '',
          position: data?.position ?? '',
          experience_years: data?.experience_years ?? 0,
          linkedin_url: data?.linkedin_url ?? null,
          cv_url: data?.cv_url ?? null,
        });
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

  async function handleSave(input: RecordInput) {
    await replaceRecord(id, input);
    router.push(`/candidates/${id}`);
  }

  return (
    <main className="p-8">
      <Link href={`/candidates/${id}`} className="text-blue-700 hover:underline">&larr; Volver al detalle</Link>
      <h2 className="text-xl font-bold mt-4">Editar candidatura</h2>

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

      {values && !loading && !error && !notFound && (
        <RecordForm initialValues={values} submitLabel="Guardar cambios" onSubmit={handleSave} />
      )}
    </main>
  );
}
