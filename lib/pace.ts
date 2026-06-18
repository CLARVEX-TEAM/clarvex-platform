// Cálculo de "ritmo del día" (pace) para el asesor: proyecta la venta de cierre
// según cuánto del turno ha transcurrido. No toca la base de datos.

export type Pace = {
  elapsedPct: number;        // % del turno transcurrido
  projected: number;         // venta proyectada al cierre del turno
  projectedAchievement: number; // % de la meta que proyecta alcanzar
  expectedSoFar: number;     // venta "esperada" a este punto (ritmo lineal)
  onTrack: boolean;          // va igual o por encima del ritmo esperado
  beforeShift: boolean;      // aún no empieza el turno
  afterShift: boolean;       // el turno ya terminó
};

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function computePace(opts: {
  sales: number;
  goal: number;
  shiftStart: string | null | undefined;
  shiftEnd: string | null | undefined;
  now?: Date;
}): Pace | null {
  const { sales, goal } = opts;
  if (goal <= 0 || !opts.shiftStart || !opts.shiftEnd) return null;
  const startM = toMinutes(opts.shiftStart);
  const endM = toMinutes(opts.shiftEnd);
  if (startM === null || endM === null || endM <= startM) return null;

  const now = opts.now ?? new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const beforeShift = nowM < startM;
  const afterShift = nowM >= endM;
  const clamped = Math.min(endM, Math.max(startM, nowM));
  const elapsedFrac = (clamped - startM) / (endM - startM);

  // Antes del 5% del turno la proyección es inestable: usa la meta como referencia.
  const projected = elapsedFrac > 0.05 ? sales / elapsedFrac : goal;
  const projectedAchievement = Math.round((projected / goal) * 100);
  const expectedSoFar = goal * elapsedFrac;
  const onTrack = sales >= expectedSoFar;

  return {
    elapsedPct: Math.round(elapsedFrac * 100),
    projected,
    projectedAchievement,
    expectedSoFar,
    onTrack,
    beforeShift,
    afterShift
  };
}
