'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RecordInput } from '@/types/record';
import { getRecordById } from '@/services/records';
import { replaceRecord } from '@/services/recordForms';
import RecordForm from '@/components/RecordForm';

export default function EditCandidate() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [values, setValues] = useState<RecordInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getRecordById(id);
        setValues({
          full_name: data.full_name,
          email: data.email,
          phone: data.phone,
          position: data.position,
          experience_years: data.experience_years,
          linkedin_url: data.linkedin_url,
          cv_url: data.cv_url,
        });
      } catch {
        setError('No se ha podido cargar la candidatura.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave(input: RecordInput) {
    await replaceRecord(id, input);
    router.push(`/candidates/${id}`);
  }

  return (
    <main className="p-8">
      <Link href={`/candidates/${id}`} className="text-blue-700 hover:underline">&larr; Volver al detalle</Link>
      <h2 className="text-xl font-bold mt-4">Editar candidatura</h2>

      {loading && <p className="mt-4">Cargando candidatura...</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

      {values && !loading && !error && (
        <RecordForm initialValues={values} submitLabel="Guardar cambios" onSubmit={handleSave} />
      )}
    </main>
  );
}
