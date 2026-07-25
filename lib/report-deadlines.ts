/**
 * Fechas en las que hay que reportar. Lógica pura y con tests: el objetivo de
 * todo esto es que nunca se te pase una entrega.
 *
 * - FALTAS: se reportan al supervisor cada quincena.
 * - RETARDOS, DOMINGOS y FESTIVOS: se capturan en Blitz ANTES del último sábado
 *   del MES RETAIL (no del mes gregoriano). La diferencia no es cosmética: en
 *   julio 2026 el último sábado del calendario es el 25, pero el mes retail
 *   cierra el 1 de agosto, así que avisar el 25 llega una semana antes de tiempo.
 */

const DAY_MS = 86_400_000;

/** Domingo de la semana retail que contiene la fecha. */
function sundayOf(date: Date): Date {
  const sunday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return sunday;
}

/**
 * Mes retail al que pertenece una semana domingo→sábado. Es la MISMA regla que
 * buildRetailMonths() aplica a las semanas del RDV, replicada aquí para poder
 * saber dónde cierra el mes ANTES de que el RDV traiga esa semana cargada.
 */
function retailMonthOfWeek(weekStart: Date): { year: number; month: number } {
  const weekEnd = new Date(weekStart.getTime() + (6 * DAY_MS));
  // Semana que cruza de mes abriendo el siguiente (arranca día 29-31) → cierra
  // en el mes del sábado. Si arranca del 1 al 28, el mes es el del domingo.
  if (weekStart.getUTCMonth() !== weekEnd.getUTCMonth() && weekStart.getUTCDate() < 29) {
    return { year: weekStart.getUTCFullYear(), month: weekStart.getUTCMonth() };
  }
  return { year: weekEnd.getUTCFullYear(), month: weekEnd.getUTCMonth() };
}

/**
 * Inicio y fin del mes retail que contiene la fecha. El fin siempre cae en
 * sábado, y los meses de 5 semanas salen solos: se recorren las semanas hacia
 * atrás y hacia adelante mientras sigan perteneciendo al mismo mes retail.
 */
export function retailMonthBoundsFor(date: Date): { start: Date; end: Date; weeks: number } {
  const week = sundayOf(date);
  const target = retailMonthOfWeek(week);
  const sameMonth = (candidate: Date) => {
    const key = retailMonthOfWeek(candidate);
    return key.year === target.year && key.month === target.month;
  };

  let start = week;
  for (;;) {
    const previous = new Date(start.getTime() - (7 * DAY_MS));
    if (!sameMonth(previous)) break;
    start = previous;
  }

  let lastWeek = week;
  for (;;) {
    const next = new Date(lastWeek.getTime() + (7 * DAY_MS));
    if (!sameMonth(next)) break;
    lastWeek = next;
  }

  return {
    start,
    end: new Date(lastWeek.getTime() + (6 * DAY_MS)),
    weeks: Math.round((lastWeek.getTime() - start.getTime()) / (7 * DAY_MS)) + 1
  };
}

/** Último sábado en o antes de una fecha (si ya es sábado, es ella misma). */
export function lastSaturdayOnOrBefore(date: Date): Date {
  const back = (date.getUTCDay() - 6 + 7) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - back));
}

/** Último sábado del mes GREGORIANO. Ya no manda la entrega: se conserva para comparar. */
export function lastSaturdayOfMonth(year: number, month: number): Date {
  return lastSaturdayOnOrBefore(new Date(Date.UTC(year, month + 1, 0)));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type Reminder = {
  kind: "QUINCENA" | "MES";
  /** Días que faltan para la entrega (0 = hoy). */
  daysLeft: number;
  message: string;
  /**
   * Identifica la entrega concreta. Con esto se confirma "ya lo subí" y se deja
   * de avisar por esa entrega, sin silenciar las siguientes.
   */
  periodKey: string;
  /** Fecha límite (el sábado del cierre retail, o el día de la quincena). */
  dueDate: string;
  /** Si el fin del mes retail salió del RDV o de la regla del calendario retail. */
  source: "RDV" | "CALENDARIO";
};

export type ReminderOptions = {
  /**
   * Fin del mes retail según las semanas YA cargadas del RDV.
   *
   * Solo se usa si va MÁS ALLÁ de lo que dice la regla del calendario retail. Si
   * se queda corto se ignora, porque un RDV al que le falta sincronizar la 5ª
   * semana diría que el mes cierra una semana antes — justo el caso que hacía
   * avisar en la semana 4.
   *
   * En la práctica las semanas del RDV se normalizan a domingo→sábado
   * (mergeRdvWeeks) y se agrupan con la MISMA regla que replica
   * retailMonthBoundsFor, así que el RDV coincide con la regla o se queda corto.
   * Esto es una red de seguridad: puede RETRASAR el aviso, nunca adelantarlo.
   */
  rdvMonthEnd?: Date | null;
  /** Entregas ya confirmadas como subidas. No se vuelve a avisar por ellas. */
  confirmedPeriodKeys?: readonly string[];
};

/**
 * ¿Toca avisar hoy? Se avisa 3 días antes y cada día hasta el mismo día — ni
 * antes (se ignora) ni después (ya no sirve de nada). Si la entrega ya se
 * confirmó, no se avisa aunque la fecha siga en rango.
 */
export function reminderFor(today: Date, options: ReminderOptions = {}): Reminder | null {
  const confirmed = new Set(options.confirmedPeriodKeys ?? []);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  // Mensual: antes del último sábado del MES RETAIL.
  const retailEnd = retailMonthBoundsFor(today).end;
  const useRdv = options.rdvMonthEnd != null && options.rdvMonthEnd.getTime() > retailEnd.getTime();
  const saturday = lastSaturdayOnOrBefore(useRdv ? options.rdvMonthEnd! : retailEnd);
  const daysToSaturday = Math.round((saturday.getTime() - today.getTime()) / DAY_MS);
  const monthKey = `MES-${dateKey(saturday)}`;
  if (daysToSaturday >= 0 && daysToSaturday <= 3 && !confirmed.has(monthKey)) {
    const when = daysToSaturday === 0 ? "es HOY" : `es en ${daysToSaturday} día${daysToSaturday === 1 ? "" : "s"}`;
    return {
      kind: "MES",
      daysLeft: daysToSaturday,
      message: `El cierre del mes retail ${when} (sábado ${saturday.getUTCDate()}). Captura en Blitz los retardos, domingos y festivos del mes.`,
      periodKey: monthKey,
      dueDate: dateKey(saturday),
      source: useRdv ? "RDV" : "CALENDARIO"
    };
  }

  // Quincenal: faltas. Se avisa el 15 y el último día del mes (calendario de
  // nómina, no retail: la quincena la fija el supervisor).
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day === 15 || day === lastDay) {
    const dueKey = dateKey(new Date(Date.UTC(year, month, day)));
    const quincenaKey = `QUINCENA-${dueKey}`;
    if (!confirmed.has(quincenaKey)) {
      return {
        kind: "QUINCENA",
        daysLeft: 0,
        message: "Cierre de quincena: reporta las faltas del periodo a tu supervisor.",
        periodKey: quincenaKey,
        dueDate: dueKey,
        source: "CALENDARIO"
      };
    }
  }

  return null;
}
