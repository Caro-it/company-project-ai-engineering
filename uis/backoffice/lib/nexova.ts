// Datos de Nexova tomados literalmente de CONTEXT.md (raíz del repo).
// Los tipos de dominio vienen de packages/shared (Hito 2) por ruta relativa:
// su "main" apunta a un index.ts inexistente (deuda técnica en memory-bank/progress.md).
import type {
  EstadoCandidatura,
  LineaServicio,
  Oficina,
  Sector,
} from "../../../packages/shared/src/types/models";

export const EMPRESA = {
  nombreCompleto: "Nexova Solutions",
  marca: "Nexova",
  fundacion: 2011,
  empleados: 120,
  facturacionAnualUsd: "≈ 8 M$",
} as const;

export const OFICINAS = [
  { nombre: "Valencia", pais: "España", rol: "Sede" },
  { nombre: "Miami", pais: "EE. UU. (Florida)", rol: "Oficina de expansión" },
] as const satisfies readonly { nombre: Oficina; pais: string; rol: string }[];

export const LINEAS_SERVICIO = [
  "Headhunting Ejecutivo",
  "Outsourcing de Atención al Cliente",
  "Formación Corporativa",
] as const satisfies readonly LineaServicio[];

export const SECTORES = [
  "Tecnología",
  "Retail",
  "Servicios Financieros",
  "Consultoría",
  "Otro",
] as const satisfies readonly Sector[];

export const ETAPAS_CANDIDATURA = [
  "Recibida",
  "En revisión",
  "Entrevista",
  "Finalista",
  "Contratada",
  "Descartada",
] as const satisfies readonly EstadoCandidatura[];

export interface Area {
  nombre: string;
  /** null = no se muestra (p. ej. Ventas: responsable pendiente de confirmar con el mentor). */
  responsable: string | null;
  equipo: string;
  datoClave: string;
}

export const AREAS: Area[] = [
  {
    nombre: "Operaciones de Selección",
    responsable: "Javier Almeida",
    equipo: "40 consultores",
    datoClave: "Cada consultor lee entre 30 y 80 CVs por proceso, de forma manual",
  },
  {
    nombre: "Formación Corporativa",
    responsable: "Elena Vargas",
    equipo: "12 personas",
    datoClave: "Catálogo en un PDF que se actualiza trimestralmente",
  },
  {
    nombre: "Atención al Cliente (externalizado)",
    responsable: "Roberto Díaz",
    equipo: "30 agentes",
    datoClave: "Resolución media de 48 h frente a un SLA comprometido de 24 h",
  },
  {
    nombre: "Ventas y Desarrollo de Negocio",
    responsable: null,
    equipo: "18 personas (6 account managers, 12 SDRs)",
    datoClave: "Solo el 40 % del equipo actualiza HubSpot con regularidad",
  },
  {
    nombre: "Marketing y Comunicación",
    responsable: "Carmen Ruiz",
    equipo: "Equipo pequeño",
    datoClave: "Web de 2019: saben cuántas visitas reciben, pero no qué convierte",
  },
  {
    nombre: "Recursos Humanos (interno)",
    responsable: "Patricia Solís",
    equipo: "4 personas",
    datoClave: "Sin tasa de rotación, sin datos de absentismo",
  },
  {
    nombre: "Tecnología e Infraestructura",
    responsable: "Sergio Molina (CTO)",
    equipo: "6 personas",
    datoClave: "Sin telemetría ni logging centralizado; despliegues manuales",
  },
  {
    nombre: "Dirección Ejecutiva",
    responsable: "Laura Mendoza (CEO)",
    equipo: "—",
    datoClave: "Informe semanal en PDF: entre 4 y 8 horas de preparación por manager",
  },
];

/** SLA de soporte del briefing: 24 h comprometidas, 48 h de media real. */
export const SLA_SOPORTE = { comprometidoHoras: 24, mediaRealHoras: 48 } as const;

export function excesoSobreSla(sla: { comprometidoHoras: number; mediaRealHoras: number }): number {
  return sla.mediaRealHoras / sla.comprometidoHoras;
}
