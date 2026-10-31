import type { RecordStatus, RecordStage } from '@/types/record';

export const STATUS_LABELS: Record<RecordStatus, string> = {
  received: 'Recibida',
  in_progress: 'En proceso',
  selected: 'Seleccionada',
  discarded: 'Descartada',
};

export const STAGE_LABELS: Record<RecordStage, string> = {
  pending: 'Pendiente de revisión',
  review: 'Revisión de CV',
  personal_interview: 'Entrevista personal',
  technical_interview: 'Entrevista técnica',
  offer_presented: 'Oferta presentada',
};

// Un valor que no está en los mapas (dato inesperado de la API) se muestra tal cual
export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABELS[status as RecordStatus] ?? status ?? 'Desconocido';
}

export function stageLabel(stage: string | null | undefined): string {
  return STAGE_LABELS[stage as RecordStage] ?? stage ?? 'Desconocida';
}

// Fecha vacía o mal formada → «—» en vez de «Invalid Date»
export function formatDate(iso: string | null | undefined, withTime = false): string {
  const date = new Date(iso ?? '');
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString('es-ES') : date.toLocaleDateString('es-ES');
}
