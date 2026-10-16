import { contarPorSector } from "../../../packages/shared/src/utils/transformations";
import type { Candidato } from "../../../packages/shared/src/types/models";
import { ETAPAS_CANDIDATURA, SECTORES } from "@/lib/nexova";

// Sin backend todavía: el pipeline arranca vacío y se calcula con la lógica del Hito 2.
const candidatos: Candidato[] = [];

export function EmptyPipeline() {
  const porSector = contarPorSector(candidatos);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        <h3 className="font-semibold text-[#001D4A]">Candidaturas por etapa</h3>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {ETAPAS_CANDIDATURA.map((etapa) => (
            <li key={etapa} className="rounded-md border border-dashed border-slate-300 p-3 text-center">
              <span className="block text-xs text-slate-600">{etapa}</span>
              <span className="mt-1 block text-xl font-bold text-slate-500">0</span>
            </li>
          ))}
        </ol>
      </article>

      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-[#001D4A]">Candidatos por sector</h3>
        <dl className="mt-4 space-y-2 text-sm">
          {SECTORES.map((sector) => (
            <div key={sector} className="flex justify-between border-b border-slate-100 pb-1">
              <dt>{sector}</dt>
              <dd className="font-semibold text-slate-600">{porSector[sector] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </article>

      <p className="text-sm text-slate-600 lg:col-span-3">
        Sin datos todavía: la API centralizada (
        <code className="rounded-sm bg-slate-200 px-1">services/api</code>) llega en el hito de backend.
      </p>
    </div>
  );
}
