import type { Candidato, Sector, NivelIngles } from '../types/models.js';

export function contarPorSector(
  candidatos: Candidato[]
): Record<Sector, number> {
  const conteo = {} as Record<Sector, number>;

  for (const candidato of candidatos) {
    const sector = candidato.sectorInteres;
    conteo[sector] = (conteo[sector] ?? 0) + 1;
  }

  return conteo;
}

export function contarPorNivelIngles(
  candidatos: Candidato[]
): Record<NivelIngles, number> {
  const conteo = {} as Record<NivelIngles, number>;

  for (const candidato of candidatos) {
    const nivel = candidato.nivelIngles;
    conteo[nivel] = (conteo[nivel] ?? 0) + 1;
  }

  return conteo;
}

export function sumarAniosExperiencia(candidatos: Candidato[]): number {
  return candidatos.reduce((total, candidato) => total + candidato.aniosExperiencia, 0);
}

export function calcularExperienciaPromedio(candidatos: Candidato[]): number {
  if (candidatos.length === 0) {
    return 0;
  }
  return sumarAniosExperiencia(candidatos) / candidatos.length;
}

export function obtenerMaximaExperiencia(candidatos: Candidato[]): number | null {
  if (candidatos.length === 0) {
    return null;
  }
  return Math.max(...candidatos.map(candidato => candidato.aniosExperiencia));
}

export function obtenerMinimaExperiencia(candidatos: Candidato[]): number | null {
  if (candidatos.length === 0) {
    return null;
  }
  return Math.min(...candidatos.map(candidato => candidato.aniosExperiencia));
}