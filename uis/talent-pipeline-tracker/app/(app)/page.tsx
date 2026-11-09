'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { TalentRecord, RecordStatus, RecordStage } from '@/types/record';
import { getRecords } from '@/services/records';
import { errorMessage } from '@/services/apiClient';
import { statusLabel, stageLabel } from '@/lib/labels';
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
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    // Si cambian los filtros antes de que llegue la respuesta, la antigua se descarta
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await getRecords({
          status: status ?? undefined,
          stage: stage ?? undefined,
          search: search ?? undefined,
        });
        if (!cancelled) setRecords(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        if (!cancelled) setError(`No se han podido cargar las candidaturas. ${errorMessage(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [status, stage, search, retries]);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">
        Pipeline de Talento — Nexova
      </h1>

      <p className="mb-4"><Link href="/candidates/new" className="text-blue-700 hover:underline">+ Registrar nueva candidatura</Link></p>
      <SearchInput />
      <FilterBar />

      {loading && <p>Cargando candidaturas…</p>}
      {error && !loading && (
        <div role="alert" className="text-red-600">
          <p>{error}</p>
          <button onClick={() => setRetries((n) => n + 1)} className="mt-2 bg-blue-700 text-white px-4 py-2">
            Reintentar
          </button>
        </div>
      )}

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
              {statusLabel(record.status)} / {stageLabel(record.stage)}
            </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
