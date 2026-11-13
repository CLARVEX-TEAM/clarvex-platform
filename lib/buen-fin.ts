// Medianoches de America/Mexico_City para esta edición, ambas en UTC−06:00.
// El offset explícito también funciona en WebViews con datos de zonas antiguos.
export const BUEN_FIN_INICIO = Date.parse("2026-11-13T00:00:00-06:00");
export const BUEN_FIN_FIN = Date.parse("2026-11-18T00:00:00-06:00");

export function buenFinActivo(ahora: number): boolean {
  return ahora >= BUEN_FIN_INICIO && ahora < BUEN_FIN_FIN;
}

export function siguienteCambioBuenFin(ahora: number): number | null {
  if (ahora < BUEN_FIN_INICIO) return BUEN_FIN_INICIO;
  return buenFinActivo(ahora) ? BUEN_FIN_FIN : null;
}
