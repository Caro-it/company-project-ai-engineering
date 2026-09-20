'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { STATUS_LABELS, STAGE_LABELS } from '@/lib/labels';

export default function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex gap-4 mb-6">
      <select
        value={searchParams.get('status') ?? ''}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="border p-2"
      >
        <option value="">Todos los estados</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get('stage') ?? ''}
        onChange={(e) => updateFilter('stage', e.target.value)}
        className="border p-2"
      >
        <option value="">Todas las etapas</option>
        {Object.entries(STAGE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}