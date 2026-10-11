'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function SearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [value, setValue] = useState(searchParams.get('search') ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);

      if (value === '') {
        params.delete('search');
      } else {
        params.set('search', value);
      }

      const query = params.toString();
      const next = query ? `${pathname}?${query}` : pathname;

      if (next !== window.location.pathname + window.location.search) {
        router.replace(next, { scroll: false });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Buscar por nombre o email"
      className="border p-2 mb-6 w-72"
    />
  );
}