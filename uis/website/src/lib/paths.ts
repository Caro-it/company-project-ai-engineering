// Construye rutas internas respetando el base de despliegue ("/" en local).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBase(path: string): string {
  return `${base}/${path}`;
}
