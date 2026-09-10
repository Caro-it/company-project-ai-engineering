// Tipos de dominio de Nexova
// Los valores literales de Candidato provienen del formulario definido en CONTEXT.md

export type PaisResidencia =
  |'España'
  | 'Estados Unidos'
  | 'Otro';

export type Sector =
  | 'Tecnología'
  | 'Retail'
  | 'Servicios Financieros'
  | 'Consultoría'
  | 'Otro';

export type NivelIngles = 
  |'Básico' 
  | 'Intermedio' 
  | 'Avanzado' 
  | 'Nativo';

export type Disponibilidad =
  | 'Inmediata'
  | '1 mes'
  | '2-3 meses'
  | 'Solo explorando';

export type LineaServicio =
  | 'Headhunting Ejecutivo'
  | 'Outsourcing de Atención al Cliente'
  | 'Formación Corporativa';

export type Oficina = 'Valencia' | 'Miami';

export type EstadoProceso = 'Abierto' | 'En curso' | 'Cerrado' | 'Cancelado';

export type EstadoCandidatura =
  | 'Recibida'
  | 'En revisión'
  | 'Entrevista'
  | 'Finalista'
  | 'Contratada'
  | 'Descartada';

export interface Candidato {
  id: number;
  nombreCompleto: string;
  email: string;
  telefono: string;
  paisResidencia: PaisResidencia;
  aniosExperiencia: number;
  sectorInteres: Sector;
  nivelIngles: NivelIngles;
  disponibilidad: Disponibilidad;
  linkedin: string | null;
  comentarios: string | null;
  aceptaPoliticaDatos: boolean;
  fechaRegistro: Date;
}

export interface Cliente {
  id: number;
  nombreEmpresa: string;
  sector: Sector;
  oficinaAsignada: Oficina;
  fechaAlta: Date;
  activo: boolean;
}

export interface Proceso {
  id: number;
  clienteId: number;
  titulo: string;
  lineaServicio: LineaServicio;
  sector: Sector;
  oficina: Oficina;
  aniosExperienciaMinimos: number;
  nivelInglesMinimo: NivelIngles;
  estado: EstadoProceso;
  fechaApertura: Date;
  fechaCierre: Date | null;
}

export interface Candidatura {
  id: number;
  candidatoId: number;
  procesoId: number;
  estado: EstadoCandidatura;
  fechaPresentacion: Date;
  puntuacion: number | null;
}