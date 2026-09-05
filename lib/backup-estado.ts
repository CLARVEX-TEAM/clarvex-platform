/**
 * Resultado estructurado de cada respaldo, por destino.
 *
 * ⚠️ **Existe porque el monitor afirmaba lo que no sabía.** `vigilante-infra.sh`
 * buscaba la línea «subido a r2://» en el registro y de ahí concluía
 * «Respaldo: … en R2 y S3». La copia en S3 podía haber fallado —falla sin
 * tumbar el respaldo, y eso es deliberado— y el aviso decía que estaba hecha.
 *
 * ⚠️ Y buscaba en las últimas veinte líneas del registro, así que **un fallo de
 * hoy quedaba tapado por un éxito de ayer** mientras siguiera visible. Aquí cada
 * ejecución escribe su propio resultado y se sobrescribe entero: lo que se lee
 * es siempre la última corrida, no la última línea que casó.
 *
 * Sin Prisma ni AWS a propósito: son tipos y una función pura, para poder
 * cubrirlas con pruebas sin nube ni base de datos.
 */

/** Cómo le fue a UN destino en UNA ejecución. */
export type ResultadoDestino =
  | {
      estado: "ok";
      /** La clave del objeto que se confirmó escrito. Sin esto, «ok» es una opinión. */
      objeto: string;
      bytes: number;
    }
  | { estado: "fallo"; error: string }
  /** No está configurado. No es un fallo, pero tampoco es una copia. */
  | { estado: "sin-configurar" };

export type EstadoRespaldo = {
  /** ISO 8601. Cuándo TERMINÓ la ejecución, no cuándo empezó. */
  terminadoEn: string;
  r2: ResultadoDestino;
  s3: ResultadoDestino;
};

export type Veredicto = {
  /** Nada que reportar. */
  sano: boolean;
  /** El respaldo principal falló o lleva demasiado sin correr. */
  problemas: string[];
  /**
   * Hay copia principal pero falta la cruzada.
   *
   * ⚠️ Va separado de `problemas` a propósito: perder la segunda nube es serio
   * pero NO es quedarse sin respaldo, y mezclarlos hace que se lean igual. El
   * día que de verdad no haya copia, tiene que destacar.
   */
  degradaciones: string[];
  /** Para el mensaje de «todo bien». */
  resumen: string | null;
};

const HORA_MS = 3_600_000;

/**
 * Cuánto puede pasar entre respaldos antes de que sea un problema.
 *
 * El cron es diario; el margen sobre 24 h absorbe un retraso normal sin gritar.
 *
 * ⚠️ **El mismo número vive en `scripts/vigilante-infra.sh`** como
 * `RESPALDO_MAX_HORAS`, porque el monitor es bash y no puede importar esto.
 * Al tocar uno, tocar el otro: con umbrales distintos, la prueba diría que un
 * respaldo está bien y el monitor avisaría de que no.
 */
export const MAXIMO_HORAS = 26;

/** Juzga el último respaldo. */
export function evaluarRespaldo(
  estado: EstadoRespaldo | null,
  ahora: Date,
  maximoHoras = MAXIMO_HORAS
): Veredicto {
  const problemas: string[] = [];
  const degradaciones: string[] = [];

  if (!estado) {
    return {
      sano: false,
      problemas: ["No hay resultado de ningún respaldo: el respaldo diario nunca ha corrido aquí, o no pudo escribir su estado."],
      degradaciones: [],
      resumen: null
    };
  }

  const terminado = new Date(estado.terminadoEn);
  if (Number.isNaN(terminado.getTime())) {
    return {
      sano: false,
      problemas: [`El estado del respaldo tiene una fecha ilegible: ${estado.terminadoEn}`],
      degradaciones: [],
      resumen: null
    };
  }

  const horas = Math.floor((ahora.getTime() - terminado.getTime()) / HORA_MS);
  if (horas > maximoHoras) {
    problemas.push(`El respaldo de la base no corre desde hace ${horas} h. Debería ser diario.`);
  }

  // ── R2: es el respaldo de verdad ────────────────────────────────────────
  if (estado.r2.estado === "fallo") {
    problemas.push(`El respaldo a R2 FALLÓ hace ${horas} h: ${estado.r2.error}`);
  } else if (estado.r2.estado === "sin-configurar") {
    problemas.push("R2 no está configurado: no hay respaldo principal.");
  }

  // ── S3: la copia en otra nube ───────────────────────────────────────────
  if (estado.s3.estado === "fallo") {
    degradaciones.push(`La copia cruzada en S3 falló: ${estado.s3.error}. El respaldo de R2 sí se hizo.`);
  } else if (estado.s3.estado === "sin-configurar") {
    degradaciones.push("No hay copia cruzada en S3 (BACKUP_S3_* sin configurar). Todo depende de un solo proveedor.");
  }

  const sano = problemas.length === 0 && degradaciones.length === 0;

  let resumen: string | null = null;
  if (estado.r2.estado === "ok") {
    const mb = (estado.r2.bytes / 1_048_576).toFixed(1);
    const destinos = estado.s3.estado === "ok" ? "en R2 y S3" : "solo en R2";
    resumen = `Respaldo: hace ${horas} h, ${mb} MB, ${destinos} (${estado.r2.objeto}).`;
  }

  return { sano, problemas, degradaciones, resumen };
}
