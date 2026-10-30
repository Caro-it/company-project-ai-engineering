'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RecordInput } from '@/types/record';
import { createRecord } from '@/services/recordForms';
import RecordForm from '@/components/RecordForm';

export default function NewCandidate() {
  const router = useRouter();

  async function handleCreate(input: RecordInput) {
    const created = await createRecord(input);
    // Sin id no se puede abrir la ficha (evita /candidates/undefined): se vuelve al listado
    router.push(created?.id ? `/candidates/${created.id}` : '/');
  }

  return (
    <main className="p-8">
      <Link href="/" className="text-blue-700 hover:underline">&larr; Volver al listado</Link>
      <h2 className="text-xl font-bold mt-4">Registrar nueva candidatura</h2>
      <RecordForm submitLabel="Registrar candidatura" onSubmit={handleCreate} />
    </main>
  );
}
