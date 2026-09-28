/**
 * En qué momento del día está la persona, que es lo que decide QUÉ número
 * manda en «Mi día».
 *
 * La pantalla anterior enseñaba siempre lo mismo: seis cifras compitiendo, la
 * venta arriba del todo. Pero a las nueve de la mañana la venta del día es
 * `$0.00` y no significa nada --la tienda ni ha abierto--, y a las diez de la
 * noche «te faltan $9,840» es un reproche sobre una jornada que ya terminó.
 *
 * La misma pantalla, tres preguntas distintas según la hora:
 *
 * | Momento | La pregunta | El número |
 * |---|---|---|
 * | `antes`  | ¿cuándo entro?     | cuánto falta para el turno |
 * | `turno`  | ¿cómo voy?         | cuánto falta para la meta |
 * | `cierre` | ¿cómo nos fue?     | cuánto se vendió |
 * | `libre`  | ninguna de las tres | no hay número: hoy no trabaja |
 *
 * ⚠️ Vive aquí y no dentro del componente para que se pueda probar. Una regla
 * que depende de la hora es justo la que nadie comprueba a mano: habría que
 * abrir la app a las 9:15, a las 14:00 y a las 21:30 del mismo día.
 */

export type MomentoDelDia = "antes" | "turno" | "cierre" | "libre";

/**
 * Los estados de asistencia en los que la persona NO trabaja hoy.
 *
 * ⚠️ Mandan sobre el horario. Un día de descanso puede traer horario cargado
 * --la plantilla se publica por semana-- y sin esta regla la pantalla le diría
 * «entras en 1 h 20» a alguien que hoy no va a la tienda.
 */
const NO_LABORA = new Set(["REST", "VACATION", "PAID_DAY"]);

export type EntradaMomento = {
  /**
   * Minutos desde la medianoche EN MONTERREY, o `null` si todavía no se sabe.
   *
   * ⚠️ `null` no es cero. El reloj del cliente no existe durante el pintado del
   * servidor, así que la pantalla arranca sin hora; tomarlo como medianoche
   * pintaría «entras en 10 h 30» un instante antes de corregirse.
   */
  minutosAhora: number | null;
  /** `HH:MM` del inicio del turno, tal como viene de la API. */
  inicio: string | null;
  /** `HH:MM` del fin del turno. */
  fin: string | null;
  /** Estado de asistencia de hoy, si ya hay fila. */
  estadoAsistencia: string | null;
  /** Hora de salida marcada, si ya se fue. */
  salida: string | null;
};

/** `HH:MM` → minutos desde la medianoche. `null` si no es una hora. */
export function minutosDeHora(valor: string | null): number | null {
  if (!valor) return null;
  const trozos = /^(\d{1,2}):(\d{2})/.exec(valor);
  if (!trozos) return null;
  const hora = Number(trozos[1]);
  const minuto = Number(trozos[2]);
  if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return null;
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

/**
 * ⚠️ Devuelve `null` cuando todavía no hay hora, y eso NO es un caso raro: es
 * el primer pintado de cada carga. Quien lo use tiene que saber enseñar «aún no
 * sé», no elegir un momento por su cuenta.
 */
export function momentoDelDia(entrada: EntradaMomento): MomentoDelDia | null {
  if (entrada.estadoAsistencia && NO_LABORA.has(entrada.estadoAsistencia)) return "libre";

  const inicio = minutosDeHora(entrada.inicio);
  const fin = minutosDeHora(entrada.fin);

  /*
   * ⚠️ Sin horario NO se adivina uno.
   *
   * Es tentador caer en «turno» por omisión, que es el estado más común. Pero
   * sin horario tampoco hay meta del día ni jornada que medir, y la pantalla
   * acabaría enseñando una cuenta atrás contra una hora inventada. Mejor decir
   * que no hay turno cargado.
   */
  if (inicio === null || fin === null) return "libre";

  // Ya marcó salida: se fue, pase lo que pase con el reloj. Seguir diciendo
  // «te faltan» a quien ya cerró convierte el resumen en un reproche.
  if (entrada.salida) return "cierre";

  if (entrada.minutosAhora === null) return null;
  const ahora = entrada.minutosAhora;

  /*
   * ⚠️ Un turno puede CRUZAR la medianoche --`22:00` a `06:00`-- y entonces el
   * fin es un número menor que el inicio. Comparando a secas, esas ocho horas
   * de trabajo salen como «cierre» enteras: la persona trabajaría toda la noche
   * con la pantalla felicitándola por haber terminado.
   */
  if (fin < inicio) return ahora >= inicio || ahora < fin ? "turno" : "cierre";

  if (ahora < inicio) return "antes";
  if (ahora < fin) return "turno";
  return "cierre";
}

/**
 * Minutos que faltan para entrar. Solo tiene sentido en `antes`.
 *
 * ⚠️ Nunca negativo: si el reloj se pasó del inicio mientras la pantalla estaba
 * abierta, lo que toca es cero, no una cuenta hacia atrás en rojo.
 */
export function faltanParaEntrar(entrada: EntradaMomento): number | null {
  const inicio = minutosDeHora(entrada.inicio);
  if (inicio === null || entrada.minutosAhora === null) return null;
  return Math.max(0, inicio - entrada.minutosAhora);
}

/**
 * Cuánto se lleva del turno, de 0 a 1, para pintar la línea de la jornada.
 *
 * ⚠️ Se recorta a los extremos. Sin recortar, abrir la app cinco minutos antes
 * de entrar dibujaría la marca FUERA de la línea, y quedarse una hora de más la
 * sacaría por el otro lado.
 */
export function avanceDelTurno(entrada: EntradaMomento): number | null {
  const inicio = minutosDeHora(entrada.inicio);
  const fin = minutosDeHora(entrada.fin);
  if (inicio === null || fin === null || entrada.minutosAhora === null) return null;
  const cruzaMedianoche = fin < inicio;
  const largo = cruzaMedianoche ? 24 * 60 - inicio + fin : fin - inicio;
  if (largo <= 0) return null;
  /*
   * ⚠️ La vuelta por la medianoche solo se aplica a los turnos que de verdad la
   * cruzan. Aplicándosela a todos, abrir la app a las 8:00 de un turno de 10:30
   * a 21:00 daba `24 h - 10:30 + 8:00`, o sea más que el turno entero, y la
   * línea salía LLENA antes de entrar: se lee como una jornada ya terminada.
   * Lo encontró la prueba, no la pantalla.
   */
  const hecho = cruzaMedianoche && entrada.minutosAhora < inicio
    ? 24 * 60 - inicio + entrada.minutosAhora
    : entrada.minutosAhora - inicio;
  return Math.min(1, Math.max(0, hecho / largo));
}

/** `95 min` → `1 h 35 m`. Lo que se pinta en grande antes de entrar. */
export function duracionCorta(minutos: number): string {
  const seguro = Math.max(0, Math.round(minutos));
  const horas = Math.floor(seguro / 60);
  const resto = seguro % 60;
  if (horas && resto) return `${horas} h ${resto} m`;
  if (horas) return `${horas} h`;
  return `${resto} m`;
}
