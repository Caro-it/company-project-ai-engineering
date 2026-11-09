"use client";

import { useState } from "react";

import { IncidentsList } from "@/components/incidents/IncidentsList";
import { IncidentsStats } from "@/components/incidents/IncidentsStats";

// Resumen + listado. Son independientes: si uno falla, el otro sigue funcionando.
// Tras un cambio de estado en el listado se recarga el resumen.
export function IncidentsDashboard() {
  const [statsKey, setStatsKey] = useState(0);

  return (
    <div className="space-y-6">
      <IncidentsStats refreshKey={statsKey} />
      <IncidentsList onStatusChanged={() => setStatsKey((k) => k + 1)} />
    </div>
  );
}
