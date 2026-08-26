import { expectedEntry } from "@/lib/attendance";
import type { AttendanceCaptureEntry } from "@/lib/attendance-capture-entry";
import { firstName } from "@/lib/weekly-close";

/**
 * Decide a quien se marca en un pase de lista y a quien no.
 *
 * ⚠️ Este modulo NO puede importar Prisma, ni directa ni indirectamente. Aqui
 * viven las reglas capaces de estropear nomina, y se separo justamente para
 * poder probarlas sin levantar la base: `lib/prisma` lanza si lo cargas fuera
 * de la configuracion de integracion, y eso hacia imposible cubrirlas.
 */

export type RollCallException = {
  /** Numero de empleado, o `name` si se prefiere escribir el nombre. */
  employeeNumber?: string;
  /** Nombre tal como se dice en tienda: "Itzel", "Adrian". */
  name?: string;
  arrivedAt?: string | null;
  entryText?: string | null;
  note?: string | null;
};

export type TurnoDelDia = {
  employeeNumber: string;
  name: string;
  startTime: string | null;
  /** Estado del HORARIO: WORKING, INVENTORY, OFF, VACATION, PAID_DAY. */
  scheduled: string;
};

/** Estados de horario en los que se espera que la persona venga a trabajar. */
export const TRABAJA = ["WORKING", "INVENTORY"];

export type PlanPaseDeLista = {
  entries: AttendanceCaptureEntry[];
  respetados: { employeeNumber: string; name: string }[];
  /** Excepciones que no casaron con nadie de turno. */
  sinTurno: string[];
  /** Excepciones que casaron con MAS de una persona. No se marca ninguna. */
  ambiguos: string[];
};

/** Sin acentos ni mayusculas: "Jazmín" y "jazmin" tienen que ser la misma. */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Empareja una excepcion con alguien de turno.
 *
 * ⚠️ Si el nombre casa con DOS personas no se elige ninguna. Marcar a la
 * equivocada es tocar el sueldo de dos personas a la vez, y en silencio: la
 * que no vino saldria puntual y la que vino tarde no constaria.
 */
function emparejar(
  excepcion: RollCallException,
  turnos: TurnoDelDia[]
): { turno: TurnoDelDia } | { problema: "sin-turno" | "ambiguo"; etiqueta: string } {
  const etiqueta = String(excepcion.employeeNumber ?? excepcion.name ?? "").trim();

  if (excepcion.employeeNumber) {
    const numero = String(excepcion.employeeNumber).trim();
    const turno = turnos.find((t) => t.employeeNumber === numero);
    return turno ? { turno } : { problema: "sin-turno", etiqueta };
  }

  const buscado = plano(String(excepcion.name ?? ""));
  if (!buscado) return { problema: "sin-turno", etiqueta };

  // Primero por nombre corto, que es como se llaman en tienda; si no, por
  // cualquier parte del nombre completo.
  let candidatos = turnos.filter((t) => plano(firstName(t.name)) === buscado);
  if (candidatos.length === 0) {
    candidatos = turnos.filter((t) => plano(t.name).split(/\s+/).includes(buscado));
  }

  if (candidatos.length === 1) return { turno: candidatos[0] };
  if (candidatos.length === 0) return { problema: "sin-turno", etiqueta };
  return { problema: "ambiguo", etiqueta };
}

export function planPaseDeLista(
  turnos: TurnoDelDia[],
  excepciones: RollCallException[],
  yaCapturados: Set<string>,
  fecha: string
): PlanPaseDeLista {
  const porNumero = new Map<string, RollCallException>();
  const sinTurno: string[] = [];
  const ambiguos: string[] = [];

  for (const excepcion of excepciones) {
    const resultado = emparejar(excepcion, turnos);
    if ("turno" in resultado) porNumero.set(resultado.turno.employeeNumber, excepcion);
    else if (resultado.problema === "ambiguo") ambiguos.push(resultado.etiqueta);
    else sinTurno.push(resultado.etiqueta);
  }

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

    // Regla 2: salvo que lo nombres. No es una contradiccion --nombrar a
    // alguien es una instruccion explicita, y lo que se protege es lo que
    // pasaria sin querer.
    entries.push({
      employeeNumber: turno.employeeNumber,
      date: fecha,
      // La hora que se pone es la que el horario YA esperaba. Esta via no
      // decide estados: clasificar es cosa de `captureAttendance`, con las
      // mismas reglas de siempre. Dejarla marcar "a tiempo" por su cuenta
      // permitiria blanquear un retardo, y el retardo es dinero.
      //
      // A quien NO le tocaba trabajar se le manda SIN hora: classifyDay deriva
      // descanso o vacaciones de su propio horario. Ponerle la hora esperada
      // lo marcaria como si hubiera venido a trabajar.
      arrivedAt: excepcion
        ? (excepcion.arrivedAt ?? null)
        : TRABAJA.includes(turno.scheduled)
          ? expectedEntry(turno.startTime)
          : null,
      entryText: excepcion?.entryText ?? null,
      note: excepcion?.note ?? null
    });
  }

  return { entries, respetados, sinTurno, ambiguos };
}
