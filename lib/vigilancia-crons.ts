/**
 * Mira los registros de los crons y dice cuáles están rotos.
 *
 * ⚠️ **Existe porque hay 27 archivos de log en el servidor y nadie los abre.**
 * El 18 de septiembre de 2026 se encontraron TRES crons fallando en silencio:
 * el recordatorio de turno de la APK 1.6, que nunca entregó un aviso desde que
 * se programó, y los de plan del día y pendientes vencidos, que llevaban **24
 * días** llamando al servidor viejo —desde el día siguiente a la mudanza a AWS—.
 *
 * Lo más ilustrativo es que esos dos guiones están BIEN escritos: tienen una
 * guarda explícita para que un `.env` movido no acabe en un 401 mudo, y la
 * guarda funcionó perfecto. Escribió el error correcto veinticuatro veces en un
 * archivo que nadie abre. **Registrar un fallo no es avisarlo.**
 *
 * La lógica vive aquí y no en el guion para poder probarla: el guion solo lee el
 * disco y manda el aviso.
 */

export type RegistroCron = {
  /** Nombre del log sin extensión: `plan-reminder`. */
  nombre: string;
  /** La última línea con contenido, o `null` si el archivo no existe. */
  ultimaLinea: string | null;
  /** Horas desde la última escritura; `null` si el archivo no existe. */
  horasSinEscribir: number | null;
  /**
   * Cuántas horas puede pasar sin escribir antes de sospechar. Sale de su
   * cadencia en el crontab, con margen: un diario tolera más de 24 h porque un
   * despliegue o un reinicio pueden correr la hora.
   *
   * ⚠️ `null` cuando su expresión no se entendió: entonces NO se juzga su
   * antigüedad. Inventar un margen produce avisos falsos.
   */
  maxHoras: number | null;
  /**
   * Horas desde que se tocó el crontab por última vez.
   *
   * ⚠️ Sirve para NO denunciar a un cron recién programado que todavía no ha
   * tenido su primera corrida. Pasó al escribir esto: el aviso de energía corre
   * lunes, miércoles y viernes a mediodía y su archivo aún no existía. Un
   * vigilante que grita el primer día se ignora para siempre, y entonces no
   * sirve de nada.
   */
  horasDesdeElCrontab: number | null;
};

export type ProblemaCron = { nombre: string; motivo: string; detalle: string };

/**
 * Cuántas horas puede pasar un cron sin escribir antes de sospechar, deducidas
 * de su propia expresión.
 *
 * ⚠️ **Se lee el crontab en vez de mantener una tabla aquí.** Una lista escrita
 * a mano se separa de la realidad el día que alguien agrega un cron y no la
 * actualiza — que es EXACTAMENTE el fallo que este vigilante existe para
 * evitar. Leyendo el crontab, un cron nuevo queda vigilado por el hecho de
 * existir.
 *
 * ⚠️ Y ante una expresión que no se entienda devuelve `null`: entonces no se
 * juzga su antigüedad y solo se mira si su última salida falló. Inventar un
 * margen produciría avisos falsos, y un vigilante que grita sin motivo se
 * ignora igual que un log que nadie abre.
 */
export function cadenciaEnHoras(expresion: string): number | null {
  const campos = expresion.trim().split(/\s+/);
  if (campos.length < 5) return null;
  const [minuto, hora, , , diaSemana] = campos;
  if (!minuto || !hora || !diaSemana) return null;

  // Cada N minutos. El margen es generoso: un servidor ocupado se salta uno.
  const cadaNMinutos = minuto.match(/^\*\/(\d+)$/);
  if (cadaNMinutos) {
    const n = Number(cadaNMinutos[1]);
    return Math.max(1, (n * 3) / 60);
  }
  if (minuto === "*") return 1;

  // Cada hora, a un minuto fijo.
  if (hora === "*" || hora.includes("*/")) return 3;

  // Semanal, o varios días concretos: el hueco más largo es entre los días que
  // sí toca. Con 1,3,5 son dos días; con uno solo, siete.
  if (diaSemana !== "*") {
    const dias = diaSemana.split(",").filter(Boolean).length;
    const huecoDias = dias > 0 ? 7 / dias : 7;
    return huecoDias * 24 + 12;
  }

  // Diario. Dos horas de margen: un despliegue o un reinicio corren la hora.
  return 26;
}

/**
 * Señales de que la última corrida falló.
 *
 * ⚠️ La lista es EXPLÍCITA, no un «contiene la palabra error». Varios de estos
 * crons devuelven JSON, y un `"error":null` dentro de una respuesta correcta
 * dispararía un aviso falso. Un vigilante que grita sin motivo se ignora igual
 * que un log que nadie abre, y entonces no habremos arreglado nada.
 */
const MARCAS_DE_FALLO: Array<{ patron: RegExp; motivo: string }> = [
  { patron: /endpoint no permitido/i, motivo: "el wrapper rechazó el endpoint" },
  { patron: /\bERROR\b/, motivo: "el guion reportó un error" },
  { patron: /command not found|No such file or directory/i, motivo: "falta el guion o un programa" },
  { patron: /Permission denied/i, motivo: "permisos" },
  { patron: /\b(401|403)\b.*(Unauthorized|Forbidden)|Unauthorized|Forbidden/i, motivo: "el servidor lo rechazó" },
  { patron: /"ok"\s*:\s*false/, motivo: "la respuesta dice que no salió bien" }
];

/** Una salida que se reconoce como buena, para no juzgarla por las marcas. */
function pareceExito(linea: string): boolean {
  return /"ok"\s*:\s*true/.test(linea) || /\bOK\b/.test(linea);
}

export function revisarRegistro(registro: RegistroCron): ProblemaCron | null {
  const { nombre, ultimaLinea, horasSinEscribir, maxHoras } = registro;

  if (ultimaLinea === null || horasSinEscribir === null) {
    const recienProgramado =
      registro.horasDesdeElCrontab !== null &&
      maxHoras !== null &&
      registro.horasDesdeElCrontab < maxHoras;
    if (recienProgramado) return null;
    return { nombre, motivo: "nunca ha dejado salida", detalle: "no existe su archivo de registro" };
  }

  /*
   * ⚠️ El fallo se mira ANTES que la antigüedad. Un cron que corre cada quince
   * minutos y falla siempre tiene el archivo recién tocado: por antigüedad
   * saldría sano, y es justo el caso del recordatorio de turno.
   */
  if (!pareceExito(ultimaLinea)) {
    const marca = MARCAS_DE_FALLO.find((m) => m.patron.test(ultimaLinea));
    if (marca) {
      return { nombre, motivo: marca.motivo, detalle: ultimaLinea.slice(0, 180) };
    }
  }

  if (maxHoras !== null && horasSinEscribir > maxHoras) {
    const dias = horasSinEscribir >= 48 ? ` (${Math.floor(horasSinEscribir / 24)} días)` : "";
    return {
      nombre,
      motivo: "lleva demasiado sin correr",
      detalle: `${Math.round(horasSinEscribir)} h sin escribir${dias}; se esperaba cada ${maxHoras} h como mucho`
    };
  }

  return null;
}

export function revisarRegistros(registros: RegistroCron[]): ProblemaCron[] {
  return registros.map(revisarRegistro).filter((p): p is ProblemaCron => p !== null);
}

/** El texto del aviso, ya listo para leerse en el teléfono. */
export function avisoDeProblemas(problemas: ProblemaCron[]): string {
  if (problemas.length === 0) return "";
  const lineas = problemas.map((p) => `• ${p.nombre}: ${p.motivo}\n  ${p.detalle}`);
  return [
    problemas.length === 1 ? "Un cron no está corriendo bien:" : `${problemas.length} crons no están corriendo bien:`,
    "",
    ...lineas,
    "",
    "Revisa /home/ubuntu/logs/ en el servidor."
  ].join("\n");
}
