'use client';

import { useEffect, useState } from 'react';
import type { Record } from '@/types/record';
import { getRecords } from '@/services/records';

export default function Home() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await getRecords();
        setRecords(response.data);
      } catch {
        setError('No se han podido cargar las candidaturas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="p-8">Cargando candidaturas…</p>;
  if (error) return <p className="p-8 text-red-600">{error}</p>;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">
        Pipeline de Talento — Nexova
      </h1>
      <p className="mb-4 text-sm">{records.length} candidaturas</p>
      <ul>
        {records.map((record) => (
          <li key={record.id} className="border-b py-2">
            {record.full_name} — {record.position} — {record.status} / {record.stage}
          </li>
        ))}
      </ul>
    </main>
  );
}