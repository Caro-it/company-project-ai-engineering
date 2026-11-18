"use client";

// Telemetría de los formularios de órdenes de inventario:
// - order_form_validation_failed: la validación del cliente bloquea el envío.
// - order_form_abandoned: se tocó algún campo y se sale de la página (cambio de ruta o
//   pagehide) sin haber registrado la orden. Una vez por instancia del formulario.
// Nunca se envían los valores de los campos: solo sus nombres y contadores.
import { useEffect, useRef } from "react";

import {
  setFormDirty,
  trackOrderFormAbandoned,
  trackOrderFormValidationFailed,
  type OrderFormField,
  type OrderFormName,
} from "@/lib/telemetryTrackers";

interface FormTelemetryState {
  dirty: boolean;
  firstChangeAt: number;
  lastField: OrderFormField | undefined;
  hadValidationError: boolean;
  filledCount: number;
  reported: boolean;
}

export function useOrderFormTelemetry(form: OrderFormName, filledCount: number) {
  const state = useRef<FormTelemetryState>({
    dirty: false,
    firstChangeAt: 0,
    lastField: undefined,
    hadValidationError: false,
    filledCount: 0,
    reported: false,
  });
  // Cuántos campos tienen valor ahora mismo (se lee al abandonar)
  useEffect(() => {
    state.current.filledCount = filledCount;
  }, [filledCount]);

  useEffect(() => {
    const current = state.current;
    function reportAbandon() {
      if (!current.dirty || current.reported) return;
      current.reported = true;
      trackOrderFormAbandoned({
        form,
        last_field: current.lastField,
        fields_completed: current.filledCount,
        had_validation_error: current.hadValidationError,
        time_on_form_ms: Math.max(0, Math.round(Date.now() - current.firstChangeAt)),
      });
    }
    window.addEventListener("pagehide", reportAbandon);
    return () => {
      window.removeEventListener("pagehide", reportAbandon);
      reportAbandon();
      setFormDirty(form, false);
    };
  }, [form]);

  return {
    // Cada cambio de un campo
    fieldChanged(field: OrderFormField) {
      const current = state.current;
      if (!current.dirty) {
        current.firstChangeAt = Date.now();
        current.reported = false;
      }
      current.dirty = true;
      current.lastField = field;
      setFormDirty(form, true);
    },
    validationFailed(fields: OrderFormField[]) {
      if (fields.length === 0) return;
      state.current.hadValidationError = true;
      trackOrderFormValidationFailed(form, fields);
    },
    // Orden registrada: el formulario vuelve a empezar y ya no cuenta como abandonado
    submitted() {
      Object.assign(state.current, {
        dirty: false,
        firstChangeAt: 0,
        lastField: undefined,
        hadValidationError: false,
      });
      setFormDirty(form, false);
    },
  };
}
