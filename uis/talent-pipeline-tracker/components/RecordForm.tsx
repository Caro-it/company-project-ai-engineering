'use client';

import { useState } from 'react';
import type { RecordInput } from '@/types/record';
import { errorMessage } from '@/services/apiClient';

interface RecordFormProps {
  initialValues?: RecordInput;
  submitLabel: string;
  onSubmit: (input: RecordInput) => Promise<void>;
}

const EMPTY: RecordInput = {
  full_name: '',
  email: '',
  phone: '',
  position: '',
  experience_years: 0,
  linkedin_url: null,
  cv_url: null,
};

export default function RecordForm({ initialValues, submitLabel, onSubmit }: RecordFormProps) {
  const [values, setValues] = useState<RecordInput>(initialValues ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (values.full_name.trim().split(/\s+/).filter(Boolean).length < 2) {
      next.full_name = 'El nombre debe contener al menos nombre y apellido';
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) {
      next.email = 'Ingresa un email válido (ejemplo: nombre@empresa.com)';
    }
    if (!/^\+/.test(values.phone.trim())) {
      next.phone = 'El teléfono debe incluir código de país (ejemplo: +34 612 345 678)';
    }
    if (values.position.trim() === '') {
      next.position = 'Indica el puesto al que opta';
    }
    if (values.experience_years < 0 || values.experience_years > 50) {
      next.experience_years = 'Los años de experiencia deben estar entre 0 y 50';
    }
    if (values.linkedin_url && !/^https?:\/\//.test(values.linkedin_url)) {
      next.linkedin_url = 'Si incluyes LinkedIn, debe ser una URL válida';
    }
    if (values.cv_url && !/^https?:\/\//.test(values.cv_url)) {
      next.cv_url = 'Si incluyes el CV, debe ser una URL válida';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setMessage(null);
    setSendError(null);
    if (!validate()) return;
    try {
      setSending(true);
      await onSubmit(values);
      setMessage('Datos guardados correctamente.');
    } catch (err) {
      setSendError(`No se han podido guardar los datos. ${errorMessage(err)}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 max-w-xl mt-4">
      <label className="flex flex-col text-sm">
        Nombre completo
        <input value={values.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} className="border p-2" />
        {errors.full_name && <span className="text-red-600 text-xs">{errors.full_name}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Email
        <input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} className="border p-2" />
        {errors.email && <span className="text-red-600 text-xs">{errors.email}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Teléfono
        <input value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} placeholder="+34 612 345 678" className="border p-2" />
        {errors.phone && <span className="text-red-600 text-xs">{errors.phone}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Puesto
        <input value={values.position} onChange={(e) => setValues({ ...values, position: e.target.value })} className="border p-2" />
        {errors.position && <span className="text-red-600 text-xs">{errors.position}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Años de experiencia
        <input type="number" min={0} max={50} value={values.experience_years} onChange={(e) => setValues({ ...values, experience_years: Number(e.target.value) })} className="border p-2" />
        {errors.experience_years && <span className="text-red-600 text-xs">{errors.experience_years}</span>}
      </label>

      <label className="flex flex-col text-sm">
        LinkedIn (URL del perfil)
        <input value={values.linkedin_url ?? ''} onChange={(e) => setValues({ ...values, linkedin_url: e.target.value || null })} className="border p-2" />
        {errors.linkedin_url && <span className="text-red-600 text-xs">{errors.linkedin_url}</span>}
      </label>

      <label className="flex flex-col text-sm">
        Enlace al CV
        <input value={values.cv_url ?? ''} onChange={(e) => setValues({ ...values, cv_url: e.target.value || null })} className="border p-2" />
        {errors.cv_url && <span className="text-red-600 text-xs">{errors.cv_url}</span>}
      </label>

      <button onClick={handleSubmit} disabled={sending} className="self-start bg-blue-700 text-white px-4 py-2 disabled:opacity-50">
        {sending ? 'Guardando...' : submitLabel}
      </button>

      {message && <p className="text-sm text-green-700">{message}</p>}
      {sendError && <p className="text-sm text-red-600">{sendError}</p>}
    </div>
  );
}
