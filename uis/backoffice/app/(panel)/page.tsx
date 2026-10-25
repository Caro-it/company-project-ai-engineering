import { AreasTable } from "@/components/AreasTable";
import { EmptyPipeline } from "@/components/EmptyPipeline";
import { StatCard } from "@/components/StatCard";
import { AREAS, EMPRESA, LINEAS_SERVICIO, OFICINAS, SLA_SOPORTE, excesoSobreSla } from "@/lib/nexova";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section aria-labelledby="bienvenida">
        <h1 id="bienvenida" className="text-2xl font-bold tracking-tight text-[#001D4A] sm:text-3xl">
          Bienvenida al backoffice de {EMPRESA.marca}
        </h1>
        <p className="mt-2 max-w-3xl text-slate-700">
          Punto de partida de las herramientas internas de {EMPRESA.nombreCompleto} para selección,
          formación, soporte, ventas, RRHH y dirección.
        </p>
      </section>

      <section aria-labelledby="empresa" className="space-y-4">
        <h2 id="empresa" className="text-lg font-semibold text-[#27476E]">
          La empresa en cifras
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Empleados" value={String(EMPRESA.empleados)} detail={`Desde ${EMPRESA.fundacion}`} />
          <StatCard
            label="Oficinas"
            value={String(OFICINAS.length)}
            detail={OFICINAS.map((o) => `${o.nombre} (${o.rol.toLowerCase()})`).join(" · ")}
          />
          <StatCard
            label="Líneas de servicio"
            value={String(LINEAS_SERVICIO.length)}
            detail={LINEAS_SERVICIO.join(" · ")}
          />
          <StatCard
            label="Resolución media en soporte"
            value={`${SLA_SOPORTE.mediaRealHoras} h`}
            detail={`${excesoSobreSla(SLA_SOPORTE)}× el SLA comprometido de ${SLA_SOPORTE.comprometidoHoras} h`}
          />
        </div>
      </section>

      <section aria-labelledby="pipeline" className="space-y-4">
        <h2 id="pipeline" className="text-lg font-semibold text-[#27476E]">
          Pipeline de selección
        </h2>
        <EmptyPipeline />
      </section>

      <section aria-labelledby="areas" className="space-y-4">
        <h2 id="areas" className="text-lg font-semibold text-[#27476E]">
          Áreas y situación de partida
        </h2>
        <AreasTable areas={AREAS} />
        <p className="text-sm text-slate-600">Fuente: briefing de empresa (CONTEXT.md).</p>
      </section>
    </div>
  );
}
