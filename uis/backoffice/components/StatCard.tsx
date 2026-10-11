interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-slate-600">{label}</h3>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[#001D4A]">{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}
    </article>
  );
}
