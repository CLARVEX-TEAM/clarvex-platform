import { captureAttendance } from "@/lib/attendance-capture";
import { planPaseDeLista, type RollCallException } from "@/lib/attendance-roll-call-plan";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

export type { RollCallException } from "@/lib/attendance-roll-call-plan";

/**
 * Pase de lista: "sin novedad" y solo se nombra la excepción.
 *
 * Marca a su hora a todo el que tenía turno ese día, para no teclear lo mismo
 * cinco veces cuando lo normal es que nadie llegue tarde.
 *
 * ⚠️ NO decide estados. La hora de llegada que pone es la que el horario ya
 * esperaba, y `captureAttendance` clasifica con las mismas reglas de siempre.
 * Dejar que esta vía marcara "a tiempo" por su cuenta permitiría blanquear un
 * retardo, y el retardo es dinero.
 *
 * Dos reglas de convivencia con lo ya capturado:
 *
 *  1. A quien YA tenga asistencia de ese día NO se le toca. Mandar "sin
 *     novedad" dos veces, o mandarlo después de corregir a alguien en Retool,
 *     no puede deshacer ese trabajo en silencio.
 *  2. Las EXCEPCIONES sí se aplican aunque exista registro. No es una
 *     contradicción: escribir el nombre de alguien es una instrucción
 *     explícita, y lo que se protege es lo que pasaría sin querer.
 */

export type RollCallPerson = {
  employeeNumber: string;
  name: string;
  arrivedAt: string | null;
  expectedAt: string;
  status: string;
  minutesLate: number | null;
};

export type RollCallOutcome = {
  date: string;
  marcados: RollCallPerson[];
  respetados: { employeeNumber: string; name: string }[];
  sinTurno: string[];
  noEncontrados: string[];
  errors: string[];
};

/** Estados de horario en los que se espera que la persona venga a trabajar. */
const TRABAJA = ["WORKING", "INVENTORY"] as const;

export async function rollCall(
  storeId: string,
  fecha: string,
  excepciones: RollCallException[]
): Promise<{ ok: false; errors: string[] } | { ok: true; result: RollCallOutcome }> {
  const dia = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    return { ok: false, errors: [`Fecha inexistente: ${fecha}.`] };
  }

  const turnos = await prisma.schedule.findMany({
    where: { storeId, date: dia, status: { in: [...TRABAJA] }, user: PERSON_WHERE },
    select: {
      startTime: true,
      user: { select: { id: true, name: true, employeeNumber: true } }
    }
  });

  const yaCapturados = await prisma.attendance.findMany({
    where: { storeId, date: dia, userId: { in: turnos.map((t) => t.user.id) } },
    select: { user: { select: { employeeNumber: true } } }
  });

  const { entries, respetados, sinTurno } = planPaseDeLista(
    turnos.map((t) => ({
      employeeNumber: t.user.employeeNumber,
      name: t.user.name,
      startTime: t.startTime
    })),
    excepciones,
    new Set(yaCapturados.map((a) => a.user.employeeNumber)),
    fecha
  );

  if (entries.length === 0) {
    return {
      ok: true,
      result: { date: fecha, marcados: [], respetados, sinTurno, noEncontrados: [], errors: [] }
    };
  }

  const captura = await captureAttendance(storeId, entries);
  if (!captura.ok) return { ok: false, errors: captura.errors };

  // El resumen se lee de la BASE, no de lo que pretendiamos escribir. Si una
  // regla clasifico distinto de lo esperado, aqui se ve --que es justo lo que
  // hace util confirmarselo a quien lo mando.
  const escritos = await prisma.attendance.findMany({
    where: {
      storeId,
      date: dia,
      userId: { in: turnos.filter((t) => !respetados.some((r) => r.employeeNumber === t.user.employeeNumber)).map((t) => t.user.id) }
    },
    select: {
      userId: true,
      arrivedAt: true,
      expectedAt: true,
      status: true,
      minutesLate: true,
      user: { select: { name: true, employeeNumber: true } }
    }
  });

  const marcados: RollCallPerson[] = escritos.map((a) => ({
    employeeNumber: a.user.employeeNumber,
    name: a.user.name,
    arrivedAt: a.arrivedAt,
    expectedAt: a.expectedAt ?? "",
    status: a.status,
    minutesLate: a.minutesLate
  }));
  marcados.sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    ok: true,
    result: {
      date: fecha,
      marcados,
      respetados,
      sinTurno,
      noEncontrados: captura.result.employeesNotFound,
      errors: captura.result.errors
    }
  };
}
