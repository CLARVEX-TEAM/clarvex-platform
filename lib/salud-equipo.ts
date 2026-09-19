/**
 * Qué le pasa al teléfono de la tienda, dicho para alguien que no es técnico.
 *
 * ⚠️ **Medir no es telemetría.** La pantalla `/diagnostico` existe desde la APK
 * 1.5.1 y enseña trece filas — pero solo a quien tiene el teléfono en la mano.
 * Gerencia no puede saber que al equipo de la tienda le quedan 200 MB, o que
 * lleva tres días sin aparecer, hasta que algo se rompe.
 *
 * ⚠️ **Y las trece filas en verde no demuestran nada.** Ya pasó con el candado
 * de la huella: el diagnóstico salía perfecto porque se miraba DESPUÉS, cuando
 * todo estaba puesto. Por eso aquí no se enseña una lista de comprobaciones sino
 * los PROBLEMAS, ordenados, y con el resto callado.
 */

export type SaludCruda = {
  androidVersion?: string;
  androidSdk?: number;
  manufacturer?: string;
  model?: string;
  camera?: boolean;
  notifications?: boolean;
  network?: string;
  freeStorageBytes?: number;
  webView?: string;
  automaticTime?: boolean;
  /** Lo que la cola no ha conseguido entregar. */
  colaPendiente?: number;
  colaFallida?: number;
};

export type Aviso = {
  /** `alta` se enseña en rojo y va primero. */
  gravedad: "alta" | "media";
  texto: string;
};

/** Menos de esto y el teléfono empieza a fallar en cosas que no parecen disco. */
const DISCO_MINIMO = 500 * 1024 * 1024;
/** Por debajo de esto el WebView ya no trae funciones que la app usa. */
const WEBVIEW_MINIMO = 115;

/** Días sin aparecer a partir de los cuales conviene preguntar por el equipo. */
const DIAS_PERDIDO = 3;

function versionMayor(webView: string | undefined): number | null {
  if (!webView) return null;
  const mayor = parseInt(webView.split(".")[0] ?? "", 10);
  return Number.isFinite(mayor) ? mayor : null;
}

export function megasLibres(bytes: number | undefined): number | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  return Math.round(bytes / (1024 * 1024));
}

export function diasSinAparecer(visto: Date | null, ahora: Date = new Date()): number | null {
  if (!visto) return null;
  const dias = Math.floor((ahora.getTime() - visto.getTime()) / 86_400_000);
  return dias < 0 ? 0 : dias;
}

/**
 * Los problemas del equipo, ordenados. Lista vacía = nada que decir.
 *
 * @param visto `lastSeenAt` del dispositivo.
 * @param medido `healthAt`: cuándo se tomó esta medida. Una salud vieja no se
 *   juzga, se avisa de que es vieja.
 */
export function avisosDelEquipo(
  salud: SaludCruda | null,
  visto: Date | null,
  medido: Date | null,
  ahora: Date = new Date()
): Aviso[] {
  const avisos: Aviso[] = [];

  const dias = diasSinAparecer(visto, ahora);
  if (dias !== null && dias >= DIAS_PERDIDO) {
    avisos.push({ gravedad: "alta", texto: `Lleva ${dias} días sin conectarse.` });
  }

  /*
   * ⚠️ Sin medida NO se dice que todo está bien. Es la diferencia entre «lo
   * miré y está sano» y «nunca me lo ha contado», y confundirlas deja a un
   * equipo roto pasando por bueno.
   */
  if (!salud) {
    avisos.push({ gravedad: "media", texto: "Todavía no ha reportado su estado." });
    return avisos;
  }

  const capturasFallidas = salud.colaFallida ?? 0;
  if (capturasFallidas > 0) {
    avisos.push({
      gravedad: "alta",
      texto: `${capturasFallidas} captura(s) no se pudieron guardar y hay que rehacerlas.`
    });
  }

  const megas = megasLibres(salud.freeStorageBytes);
  if (megas !== null && salud.freeStorageBytes !== undefined && salud.freeStorageBytes < DISCO_MINIMO) {
    // Con el disco lleno fallan la cámara, las evidencias y la cola, y ninguna
    // dice que el problema es el espacio.
    avisos.push({ gravedad: "alta", texto: `Le quedan ${megas} MB libres. Hay que liberar espacio.` });
  }

  if (salud.notifications === false) {
    avisos.push({ gravedad: "alta", texto: "Tiene las notificaciones apagadas: no le llegan avisos." });
  }

  if (salud.automaticTime === false) {
    /*
     * ⚠️ Con la hora a mano, la firma del dispositivo se sale de su ventana de
     * dos minutos y las peticiones firmadas empiezan a rechazarse — con un
     * error que no habla de la hora.
     */
    avisos.push({ gravedad: "alta", texto: "No tiene la hora automática: fallarán las funciones firmadas." });
  }

  const mayor = versionMayor(salud.webView);
  if (mayor !== null && mayor < WEBVIEW_MINIMO) {
    avisos.push({ gravedad: "media", texto: `Su WebView es la ${mayor} y conviene actualizarlo desde Play Store.` });
  }

  if (salud.camera === false) {
    avisos.push({ gravedad: "media", texto: "No detecta cámara: no podrá subir evidencias ni escanear." });
  }

  const pendientes = salud.colaPendiente ?? 0;
  if (pendientes > 0) {
    avisos.push({ gravedad: "media", texto: `${pendientes} captura(s) esperando conexión.` });
  }

  const diasMedida = diasSinAparecer(medido, ahora);
  if (diasMedida !== null && diasMedida >= DIAS_PERDIDO) {
    avisos.push({ gravedad: "media", texto: `Este estado es de hace ${diasMedida} días.` });
  }

  return avisos.sort((a, b) => (a.gravedad === b.gravedad ? 0 : a.gravedad === "alta" ? -1 : 1));
}
