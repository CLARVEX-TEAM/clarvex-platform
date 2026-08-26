import { expectedEntry } from "@/lib/attendance";
import type { AttendanceCaptureEntry } from "@/lib/attendance-capture-entry";

/**
 * Decide a quien se marca en un pase de lista y a quien no.
 *
 * ⚠️ Este modulo NO puede importar Prisma, ni directa ni indirectamente. Aqui
 * viven las dos reglas capaces de estropear nomina, y se separo justamente para
 * poder probarlas sin levantar la base: `lib/prisma` lanza si lo cargas fuera
 * de la configuracion de integracion, y eso hacia imposible cubrirlas.
 */

export type RollCallException = {
  employeeNumber: string;
  arrivedAt?: string | null;
  entryText?: string | null;
  note?: string | null;
};

export type TurnoDelDia = {
  employeeNumber: string;
  name: string;
  startTime: string | null;
};

export type PlanPaseDeLista = {
  entries: AttendanceCaptureEntry[];
  respetados: { employeeNumber: string; name: string }[];
  sinTurno: string[];
};

export function planPaseDeLista(
  turnos: TurnoDelDia[],
  excepciones: RollCallException[],
  yaCapturados: Set<string>,
  fecha: string
): PlanPaseDeLista {
  const porNumero = new Map(excepciones.map((e) => [String(e.employeeNumber).trim(), e]));
  const conTurno = new Set(turnos.map((t) => t.employeeNumber));
  // Una excepcion sobre alguien sin turno se avisa en vez de inventarle uno:
  // puede ser un numero mal escrito, y marcarle asistencia seria peor.
  const sinTurno = [...porNumero.keys()].filter((n) => !conTurno.has(n));

  const entries: AttendanceCaptureEntry[] = [];
  const respetados: { employeeNumber: string; name: string }[] = [];

  for (const turno of turnos) {
    const excepcion = porNumero.get(turno.employeeNumber);

    // Regla 1: a quien ya tenga asistencia no se le toca. Mandar "sin novedad"
    // dos veces, o mandarlo despues de corregir a alguien en Retool, no puede
    // deshacer ese trabajo en silencio.
    if (!excepcion && yaCapturados.has(turno.employeeNumber)) {
      respetados.push({ employeeNumber: turno.employeeNumber, name: turno.name });
      continue;
    }

    // Regla 2: salvo que lo nombres. No es una contradiccion --escribir el
    // numero de alguien es una instruccion explicita, y lo que se protege es lo
    // que pasaria sin querer.
    entries.push({
      employeeNumber: turno.employeeNumber,
      date: fecha,
      // La hora que se pone es la que el horario YA esperaba. Esta via no
      // decide estados: clasificar es cosa de `captureAttendance`, con las
      // mismas reglas de siempre. Dejarla marcar "a tiempo" por su cuenta
      // permitiria blanquear un retardo, y el retardo es dinero.
      arrivedAt: excepcion ? (excepcion.arrivedAt ?? null) : expectedEntry(turno.startTime),
      entryText: excepcion?.entryText ?? null,
      note: excepcion?.note ?? null
    });
  }

  return { entries, respetados, sinTurno };
}
