'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TalentRecord, RecordStatus, RecordStage } from '@/types/record';
import { getRecords } from '@/services/records';
import { STATUS_LABELS, STAGE_LABELS } from '@/lib/labels';
import FilterBar from '@/components/FilterBar';
import SearchInput from '@/components/SearchInput';
import Link from 'next/link';

export default function Home() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status') as RecordStatus | null;
  const stage = searchParams.get('stage') as RecordStage | null;
  const search = searchParams.get('search');

  const [records, setRecords] = useState<TalentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await getRecords({
          status: status ?? undefined,
          stage: stage ?? undefined,
          search: search ?? undefined,
        });
        setRecords(response.data);
      } catch {
        setError('No se han podido cargar las candidaturas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [status, stage, search]);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">
        Pipeline de Talento — Nexova
      </h1>

      <p className="mb-4"><Link href="/candidates/new" className="text-blue-700 hover:underline">+ Registrar nueva candidatura</Link></p>
      <SearchInput />
      <FilterBar />

      {loading && <p>Cargando candidaturas…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mb-4 text-sm">{records.length} candidaturas</p>
          <ul>
            {records.map((record) => (
            <li key={record.id} className="border-b py-2">
              <Link
                 href={`/candidates/${record.id}`}
                 className="text-blue-700 hover:underline"
              >
                 {record.full_name}
              </Link>
              {' — '}{record.position} —{' '}
              {STATUS_LABELS[record.status]} / {STAGE_LABELS[record.stage]}
            </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}



