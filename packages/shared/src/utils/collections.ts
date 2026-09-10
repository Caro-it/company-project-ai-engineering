import type { Candidato, Sector, Disponibilidad } from '../types/models.js';

//filtrado


export function filtrarPorSector(
    candidatos:Candidato [],
    sector: Sector
): Candidato[] {
    return candidatos.filter(candidato => candidato.sectorInteres === sector);
}


export function filtrarPorExperienciaMinima(
    candidatos: Candidato[],
    minimo: number
): Candidato[] {
    return candidatos.filter(candidato => candidato.aniosExperiencia >= minimo);
}

export function filtrarPorDisponibilidad(
    candidatos: Candidato[],
    disponibilidad: Disponibilidad
): Candidato[] {
    return candidatos.filter(candidato => candidato.disponibilidad === disponibilidad);
}


export function ordenarPorExperiencia(
  candidatos: Candidato[],
  ascendente: boolean
): Candidato[] {
  const copia = [...candidatos];
  copia.sort((a, b) =>
    ascendente
      ? a.aniosExperiencia - b.aniosExperiencia
      : b.aniosExperiencia - a.aniosExperiencia
  );
  return copia;
}


export function ordenarPorNombre(
  candidatos: Candidato[],
  ascendente: boolean
): Candidato[] {
  const copia = [...candidatos];
  copia.sort((a, b) =>
    ascendente
      ? a.nombreCompleto.localeCompare(b.nombreCompleto, 'es')
      : b.nombreCompleto.localeCompare(a.nombreCompleto, 'es')
  );
  return copia;
}

export function agruparPorSector(
  candidatos: Candidato[]
): Record<Sector, Candidato[]> {
  const grupos = {} as Record<Sector, Candidato[]>;

  for (const candidato of candidatos) {
    const sector = candidato.sectorInteres;
    if (grupos[sector] === undefined) {
      grupos[sector] = [];
    }
    grupos[sector].push(candidato);
  }

  return grupos;
}

export function ordenarPorSectorYExperiencia(
  candidatos: Candidato[]
): Candidato[] {
  const copia = [...candidatos];
  copia.sort((a, b) => {
    const porSector = a.sectorInteres.localeCompare(b.sectorInteres, 'es');
    if (porSector !== 0) {
      return porSector;
    }
    return b.aniosExperiencia - a.aniosExperiencia;
  });
  return copia;
}