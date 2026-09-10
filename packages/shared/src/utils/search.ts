import type { Candidato } from '../types/models.js';

// Búsqueda lineal — para arrays desordenados
export function buscarCandidatoPorId(
  candidatos: Candidato[],
  id: number
): number {
  for (let i = 0; i < candidatos.length; i++) {
    if (candidatos[i]!.id === id) {
      return i;
    }
  }
  return -1;
}

export function buscarCandidatoPorEmail(
  candidatos: Candidato[],
  email: string
): number {
  for (let i = 0; i < candidatos.length; i++) {
    if (candidatos[i]!.email === email) {
      return i;
    }
  }
  return -1;
}

// Búsqueda binaria — requiere array ordenado por id ascendente
export function buscarBinarioPorId(
  candidatosOrdenados: Candidato[],
  id: number
): number {
  let inicio = 0;
  let fin = candidatosOrdenados.length - 1;

  while (inicio <= fin) {
    const medio = Math.floor((inicio + fin) / 2);
    const idMedio = candidatosOrdenados[medio]!.id;

    if (idMedio === id) {
      return medio;
    }

    if (idMedio < id) {
      inicio = medio + 1;
    } else {
      fin = medio - 1;
    }
  }

  return -1;
}