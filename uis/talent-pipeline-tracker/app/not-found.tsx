import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Página no encontrada — Talent Pipeline Tracker',
};

export default function NotFound() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Página no encontrada</h1>
      <p>La dirección no existe o la página se ha movido.</p>
      <p className="mt-4">
        <Link href="/" className="text-blue-700 hover:underline">&larr; Volver al listado</Link>
      </p>
    </main>
  );
}
