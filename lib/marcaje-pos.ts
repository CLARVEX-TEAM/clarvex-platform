/**
 * La foto de la pantalla «Marcar entrada» / «Marcar salida» del POS, mandada al
 * bot de WhatsApp. Aquí vive lo que se decide con lo que leyó la IA: sin Prisma
 * ni Bedrock a propósito, para poder probarlo. Quien lee es `lib/foto-bot-ia.ts`
 * y quien escribe es `lib/marcaje-registro.ts`.
 *
 * La pantalla trae, de arriba abajo:
 *
 *   Asesor:  113642 - EDUARDO ALONSO TREVIÃ'O
 *   Estado:  Marcar salida - 07/11/2026 09:17 p. m.   ← la ÚLTIMA marca que hizo
 *   Fecha:   08/11/2026
 *   Hora:    08/11/2026 10:43 a. m.                   ← la de ahora
 *
 * ⚠️ **Se identifica por el NÚMERO, nunca por el nombre.** El POS estropea la Ñ
 * («TREVIÃ'O») igual que en el reporte de venta.
 *
 * ⚠️ **La fecha de la pantalla tiene que ser HOY.** Una foto vieja reenviada
 * registraría la entrada de otro día con la hora de otro día, y el retardo es
 * dinero.
 */

export type Pantalla = "entrada" | "salida";

export type LecturaMarcaje = {
  pantalla: Pantalla | null;
  numeroEmpleado: string | null;
  /** «08/11/2026», tal como sale en pantalla. */
  fecha: string | null;
  /** «10:43 a. m.», tal como sale en pantalla. */
  hora: string | null;
  /** La línea «Estado»: lo último que marcó la persona, y cuándo. */
  ultimaMarca: { accion: Pantalla; fecha: string; hora: string } | null;
};

export type Escritura = {
  /** AAAA-MM-DD */
  fecha: string;
  campo: "arrivedAt" | "leftAt";
  /** HH:MM en 24 horas. */
  hora: string;
  /** Lo que se deduce del «Estado» no pisa una hora ya capturada. */
  soloSiFalta: boolean;
};

export type PlanMarcaje =
  | { ok: true; numeroEmpleado: string; pantalla: Pantalla; hora: string; escrituras: Escritura[] }
  | { ok: false; motivo: "ilegible" | "otro-dia"; fecha?: string };

/** «08/11/2026» → «2026-11-08». `null` si no es una fecha que exista. */
export function fechaIso(texto: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(texto ?? "");
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * «10:43 a. m.» → «10:43»; «09:17 p. m.» → «21:17»; «12:05 a. m.» → «00:05».
 * También acepta 24 horas sin sufijo. `null` si no se entiende.
 */
export function hora24(texto: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])?\.?\s*(?:m\.?)?\s*$/i.exec(texto ?? "");
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sufijo = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (sufijo) {
    if (h < 1 || h > 12) return null;
    if (sufijo === "a" && h === 12) h = 0;
    if (sufijo === "p" && h !== 12) h += 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function diaAnterior(iso: string): string {
  return new Date(new Date(`${iso}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** Solo dígitos: «113642», aunque la IA lo devuelva con espacios o guion. */
export function numeroLimpio(texto: string | null | undefined): string | null {
  const solo = (texto ?? "").replace(/\D/g, "");
  return solo.length >= 3 && solo.length <= 12 ? solo : null;
}

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Una «salida» a menos de esto de la entrada no es una salida: es la foto de la entrada. */
export const MINUTOS_MISMA_MARCA = 60;

/**
 * Qué se escribe con una foto, dado el día de hoy en Monterrey.
 *
 * ⚠️ **La acción se deduce del «Estado», no del título.** El 9 nov 2026 llegaron
 * dos fotos que el título engañaba:
 *  - la de Waira venía recortada, sin el título, y la IA dijo «salida»;
 *  - la de Alonso era la pantalla de DESPUÉS de marcar la entrada (Estado:
 *    «Marcar entrada - hoy 10:44», y ya ofrecía «Marcar salida»).
 * El «Estado» siempre se ve: si lo último fue una salida, esto es la entrada; si
 * lo último fue la entrada de hoy hace unos minutos, la foto ES esa entrada.
 *
 * Además, si el «Estado» es la SALIDA de AYER, es la salida real de ayer y pisa
 * la que puso la auto-asunción de las 10 pm, que es una suposición.
 */
export function planDeMarcaje(lectura: LecturaMarcaje, hoy: string): PlanMarcaje {
  const numero = numeroLimpio(lectura.numeroEmpleado);
  const fecha = fechaIso(lectura.fecha);
  const hora = hora24(lectura.hora);
  const ultima = lectura.ultimaMarca;
  const fechaUltima = fechaIso(ultima?.fecha);
  const horaUltima = hora24(ultima?.hora);
  const hayUltima = Boolean(ultima && fechaUltima && horaUltima);

  const pantalla: Pantalla | null = hayUltima ? (ultima!.accion === "salida" ? "entrada" : "salida") : lectura.pantalla;
  if (!numero || !fecha || !hora || !pantalla) return { ok: false, motivo: "ilegible" };
  if (fecha !== hoy) return { ok: false, motivo: "otro-dia", fecha };

  // La pantalla de después de marcar: la foto es la entrada que acaba de hacer.
  if (
    pantalla === "salida" && hayUltima && ultima!.accion === "entrada" && fechaUltima === hoy &&
    minutos(hora) - minutos(horaUltima!) < MINUTOS_MISMA_MARCA
  ) {
    return {
      ok: true,
      numeroEmpleado: numero,
      pantalla: "entrada",
      hora: horaUltima!,
      escrituras: [{ fecha: hoy, campo: "arrivedAt", hora: horaUltima!, soloSiFalta: false }]
    };
  }

  const escrituras: Escritura[] = [
    { fecha: hoy, campo: pantalla === "entrada" ? "arrivedAt" : "leftAt", hora, soloSiFalta: false }
  ];
  if (hayUltima) {
    if (ultima!.accion === "salida" && fechaUltima === diaAnterior(hoy)) {
      escrituras.push({ fecha: fechaUltima, campo: "leftAt", hora: horaUltima!, soloSiFalta: false });
    }
    if (ultima!.accion === "entrada" && fechaUltima === hoy && pantalla === "salida") {
      escrituras.push({ fecha: hoy, campo: "arrivedAt", hora: horaUltima!, soloSiFalta: true });
    }
  }
  return { ok: true, numeroEmpleado: numero, pantalla, hora, escrituras };
}

/**
 * Una fila de asistencia ya existente más lo nuevo. Nunca borra lo que había:
 * la captura de asistencia reescribe la fila ENTERA, así que mandarle solo la
 * salida de ayer le quitaría la entrada.
 */
export function mezclarAsistencia(
  existente: { arrivedAt: string | null; lunchStart: string | null; leftAt: string | null; entryText: string | null; note: string | null } | null,
  escrituras: Escritura[]
): { arrivedAt: string | null; lunchStart: string | null; leftAt: string | null; entryText: string | null; note: string | null; cambios: Escritura[] } {
  const fila = {
    arrivedAt: existente?.arrivedAt ?? null,
    lunchStart: existente?.lunchStart ?? null,
    leftAt: existente?.leftAt ?? null,
    entryText: existente?.entryText ?? null,
    note: existente?.note ?? null
  };
  const cambios: Escritura[] = [];
  for (const e of escrituras) {
    if (e.soloSiFalta && fila[e.campo]) continue;
    if (fila[e.campo] === e.hora) continue;
    fila[e.campo] = e.hora;
    cambios.push(e);
  }
  // Una hora de entrada y «FALTA» se contradicen: si marcó en el POS, vino.
  if (fila.arrivedAt) fila.entryText = null;
  if (cambios.length && !fila.note) fila.note = "Marcaje del POS por WhatsApp";
  return { ...fila, cambios };
}
