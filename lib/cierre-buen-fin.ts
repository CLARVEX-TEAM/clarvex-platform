import { monterreyMinutesOfDay, resolveMonterreyDate } from "@/lib/cron-time";

const SAN_AGUSTIN = "clarvex-demo-store";

const horariosEspeciales = {
  plaza: 22 * 60 + 5,
  diario: 22 * 60 + 30,
  desempeno: 22 * 60 + 45,
  semanal: 23 * 60
};

/** Cada corte habitual conserva las demás tiendas. El corte tardío cubre San Agustín. */
export function tiendasParaCierreBuenFin(
  corte: keyof typeof horariosEspeciales,
  fecha: ReturnType<typeof resolveMonterreyDate>,
  ahora: Date
): { id: string | { not: string } } | undefined {
  if (fecha.dateKey < "2026-11-13" || fecha.dateKey > "2026-11-17") return undefined;

  return {
    id: monterreyMinutesOfDay(ahora) >= horariosEspeciales[corte]
      ? SAN_AGUSTIN
      : { not: SAN_AGUSTIN }
  };
}
