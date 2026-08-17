import { matchCuotaJusta, parseCuotaJusta, weeklyTotal, type MatchOutcome } from "@/lib/cuota-justa";
import { recalculateMonths } from "@/lib/kpi-capture";
import { prisma } from "@/lib/prisma";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { PERSON_WHERE } from "@/lib/store-people";

/**
 * Siembra las metas diarias a partir de la Cuota Justa pegada desde Excel.
 *
 * ⚠️ **Nunca toca las ventas.** Cuando el día ya tiene KPIs capturados, se
 * actualiza SOLO `dailyGoal`; el resto de la fila se deja intacta. Escribir la
 * meta no puede costar la venta de un día ya cerrado.
 *
 * Las metas se conocen con la semana por delante, así que para los días que aún
 * no existen se crea la fila con la meta y las ventas en cero. La captura de
 * KPIs de ese día después actualiza esa misma fila.
 */

export type GoalPreviewRow = {
  name: string;
  employeeNumber: string;
  /** Meta por día, en el orden de `dates`. */
  goals: (number | null)[];
  total: number;
};

export type GoalPreview = {
  dates: string[];
  rows: GoalPreviewRow[];
  storeGoals: (number | null)[];
  storeTotal: number;
  unmatched: string[];
  ambiguous: { name: string; candidates: string[] }[];
  warnings: string[];
};

export type GoalOutcome<T> = { ok: true; result: T } | { ok: false; errors: string[] };

async function resolve(storeId: string, text: string) {
  const parsed = parseCuotaJusta(text);
  if (!parsed.ok) return { ok: false as const, errors: [parsed.error] };

  const candidates = await prisma.user.findMany({
    // `PERSON_WHERE` ya filtra activos y excluye al usuario del kiosko, que está
    // dado de alta como ASESOR y no es una persona — ver `lib/store-people`.
    where: { storeId, ...PERSON_WHERE },
    select: { id: true, name: true, employeeNumber: true }
  });
  const match = matchCuotaJusta(parsed.value.people, candidates);
  return { ok: true as const, parsed: parsed.value, match };
}

/** Qué se va a escribir, sin escribir nada. */
export async function previewGoals(storeId: string, text: string): Promise<GoalOutcome<GoalPreview>> {
  const resolved = await resolve(storeId, text);
  if (!resolved.ok) return { ok: false, errors: resolved.errors };
  const { parsed, match } = resolved;

  return {
    ok: true,
    result: {
      dates: parsed.dates,
      rows: match.matched.map((person) => ({
        name: person.user.name,
        employeeNumber: person.user.employeeNumber,
        goals: parsed.dates.map((date) => person.goals[date] ?? null),
        total: weeklyTotal({ name: person.source, goals: person.goals })
      })),
      storeGoals: parsed.dates.map((date) => parsed.storeGoals[date] ?? null),
      storeTotal: Object.values(parsed.storeGoals).reduce((sum, value) => sum + value, 0),
      unmatched: match.unmatched,
      ambiguous: match.ambiguous,
      warnings: parsed.warnings
    }
  };
}

export type GoalWriteResult = {
  created: number;
  updated: number;
  people: number;
  dates: string[];
  unmatched: string[];
  warnings: string[];
};

export async function captureGoals(storeId: string, text: string): Promise<GoalOutcome<GoalWriteResult>> {
  const resolved = await resolve(storeId, text);
  if (!resolved.ok) return { ok: false, errors: resolved.errors };
  const { parsed, match } = resolved;

  // Un nombre ambiguo detiene TODO. Sembrar media semana y dejar a alguien fuera
  // deja la tienda con metas a medias y sin señal de qué falta.
  const blocking = blockingErrors(match);
  if (blocking.length > 0) return { ok: false, errors: blocking };

  let created = 0;
  let updated = 0;
  const touched: { userId: string; date: Date }[] = [];

  for (const person of match.matched) {
    for (const [day, dailyGoal] of Object.entries(person.goals)) {
      const date = new Date(`${day}T00:00:00.000Z`);
      const week = reconstructRdvWeek(date);
      const existing = await prisma.kpi.findUnique({
        where: { userId_date: { userId: person.user.id, date } },
        select: { id: true }
      });

      if (existing) {
        // SOLO la meta: la venta de ese día ya puede estar capturada.
        await prisma.kpi.update({ where: { id: existing.id }, data: { dailyGoal } });
        updated += 1;
      } else {
        await prisma.kpi.create({
          data: {
            userId: person.user.id,
            storeId,
            date,
            dailyGoal,
            weekNumber: week.weekNumber,
            weekStart: week.weekStart,
            weekEnd: week.weekEnd,
            // La venta del día todavía no ocurre. La captura de KPIs la pondrá
            // sobre esta misma fila.
            dailySales: 0,
            transactions: 0,
            pieces: 0,
            upt: 0,
            avgTicket: 0,
            ranking: 0,
            monthlySales: 0,
            monthlyGoal: 0
          }
        });
        created += 1;
      }
      touched.push({ userId: person.user.id, date });
    }
  }

  // La meta mensual es la suma de las diarias: sin esto, sembrar una semana la
  // dejaría desactualizada hasta la siguiente captura de KPIs.
  await recalculateMonths(storeId, touched);

  return {
    ok: true,
    result: {
      created,
      updated,
      people: match.matched.length,
      dates: parsed.dates,
      unmatched: match.unmatched,
      warnings: parsed.warnings
    }
  };
}

/** Lo que impide escribir. Los no encontrados solo avisan; los ambiguos paran. */
function blockingErrors(match: MatchOutcome): string[] {
  const errors = match.ambiguous.map(
    (item) => `«${item.name}» encaja con varias personas (${item.candidates.join(", ")}). Corrige el nombre en la Cuota Justa para que sea inequívoco.`
  );
  if (match.matched.length === 0) {
    errors.push("Ninguno de los nombres de la Cuota Justa corresponde a alguien de esta tienda.");
  }
  return errors;
}
