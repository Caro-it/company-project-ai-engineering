import type { Area } from "@/lib/nexova";

export function AreasTable({ areas }: { areas: Area[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Áreas de Nexova, responsables, equipos y situación actual</caption>
        <thead className="bg-slate-50 text-slate-700">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Área</th>
            <th scope="col" className="px-4 py-3 font-semibold">Responsable</th>
            <th scope="col" className="px-4 py-3 font-semibold">Equipo</th>
            <th scope="col" className="px-4 py-3 font-semibold">Situación actual</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {areas.map((area) => (
            <tr key={area.nombre}>
              <th scope="row" className="px-4 py-3 font-medium text-[#001D4A]">{area.nombre}</th>
              <td className="px-4 py-3">{area.responsable ?? "—"}</td>
              <td className="px-4 py-3">{area.equipo}</td>
              <td className="px-4 py-3 text-slate-700">{area.datoClave}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
