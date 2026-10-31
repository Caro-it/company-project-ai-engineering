import { LogoutButton } from "@/components/LogoutButton";
import { NavLink } from "@/components/NavLink";
import { AREAS, EMPRESA } from "@/lib/nexova";

export function Sidebar() {
  return (
    <aside className="bg-[#001D4A] text-slate-200 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto">
      <div className="px-4 py-5 sm:px-6 lg:py-8">
        <p className="text-xl font-bold tracking-tight text-white">
          {EMPRESA.marca}{" "}
          <span className="font-normal text-[#ECA400]">Backoffice</span>
        </p>

        <nav aria-label="Secciones del backoffice" className="mt-6">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            <li>
              <NavLink href="/">Inicio</NavLink>
            </li>
            <li>
              <NavLink href="/incidencias">Incidencias</NavLink>
            </li>
            <li>
              <NavLink href="/incidencias/nueva">Registrar incidencia</NavLink>
            </li>
            <li>
              <NavLink href="/incidencias/analizador">
                Análisis de incidencias (CSV)
              </NavLink>
            </li>
            <li>
              <NavLink href="/proveedores">Directorio de proveedores</NavLink>
            </li>
            <li>
              <NavLink href="/account/profile">Mi perfil</NavLink>
            </li>
            <li>
              <NavLink href="/account/change-password">Cambiar contraseña</NavLink>
            </li>
            <li>
              <LogoutButton />
            </li>
          </ul>
        </nav>

        <h2 className="mt-6 hidden text-xs font-semibold tracking-wider text-slate-300 uppercase lg:block">
          Áreas · próximamente
        </h2>
        <ul className="mt-2 hidden space-y-1 lg:block">
          {AREAS.map((area) => (
            <li
              key={area.nombre}
              className="px-3 py-1.5 text-sm text-slate-300"
            >
              {area.nombre}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
