"use client";

import { useEffect, useEffectEvent, useState } from "react";

export interface ApiResourceOptions<T> {
  // Valor de data antes de la primera respuesta (y tras un error, salvo keepDataOnError)
  initialData: T;
  // Convierte el error de la petición en el texto que se muestra al usuario
  toMessage: (error: unknown) => string;
  // true: si una recarga falla, se siguen mostrando los últimos datos buenos
  keepDataOnError?: boolean;
}

export interface ApiResource<T> {
  data: T;
  error: string | null;
  // true mientras la respuesta guardada no corresponde a la petición actual
  loading: boolean;
  // Repite la petición actual (botón "Reintentar" o recarga tras un alta)
  retry: () => void;
  // Cambia los datos en local (p. ej. una actualización optimista de una fila)
  setData: (update: (prev: T) => T) => void;
}

interface Result<T> {
  key: string;
  data: T;
  error: string | null;
}

// Carga datos de la API con estados de carga, error y reintento.
//
// requestKey identifica la petición: cuando cambia (p. ej. un filtro), se vuelve a llamar a
// fetcher. Sigue el patrón "clave de petición" del backoffice: loading se deriva de la clave
// de la última respuesta, sin setState síncrono dentro del efecto (lo prohíbe la regla
// react-hooks/set-state-in-effect), y las respuestas de peticiones ya obsoletas se descartan.
export function useApiResource<T>(
  requestKey: string,
  fetcher: () => Promise<T>,
  { initialData, toMessage, keepDataOnError = false }: ApiResourceOptions<T>,
): ApiResource<T> {
  const [retries, setRetries] = useState(0);
  const [result, setResult] = useState<Result<T>>({
    key: "",
    data: initialData,
    error: null,
  });

  const key = `${requestKey}#${retries}`;

  // Leen siempre el fetcher y las opciones del último render sin ser dependencias del efecto
  const fetchData = useEffectEvent(() => fetcher());
  const describeFailure = useEffectEvent((e: unknown) => ({
    error: toMessage(e),
    keep: keepDataOnError,
    fallback: initialData,
  }));

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        const { error, keep, fallback } = describeFailure(e);
        setResult((prev) => ({ key, data: keep ? prev.data : fallback, error }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    data: result.data,
    error: result.error,
    loading: result.key !== key,
    retry: () => setRetries((n) => n + 1),
    setData: (update) =>
      setResult((prev) => ({ ...prev, data: update(prev.data) })),
  };
}
