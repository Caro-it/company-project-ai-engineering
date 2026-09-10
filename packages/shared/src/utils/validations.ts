
import type { Candidato, Proceso } from '../types/models.js';

export function tieneExperienciaValida(aniosExperiencia: number): boolean {
  //experiencia en años debe estar entre 0 y 50
  return aniosExperiencia >= 0 && aniosExperiencia <= 50;
}

export function tieneNombreValido(nombreCompleto: string): boolean {
  // El nombre completo debe tener al menos dos palabras
  const palNombres = nombreCompleto.trim().split(/\s+/);
  return palNombres.length >= 2;
}

export function tieneComentariosValidos(comentarios: string | null): boolean {
  // máximo 500 caracteres, campo opcional
  return comentarios === null || comentarios.length <= 500;
}

export function tieneEmailValido(email: string): boolean {
  // Validar formato de email usando expresión regular
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function tieneTelefonoValido(telefono: string): boolean {
  const limpio = telefono.trim();
  const digitos = limpio.replace(/[^0-9]/g, '');
  return /^\+[0-9][0-9\s().-]*$/.test(limpio) && digitos.length >= 8;
}

export function tieneLinkedinValido(linkedin: string | null): boolean {
  // si existe, debe empezar por http:// o https://
  return linkedin === null || /^https?:\/\//.test(linkedin);
}