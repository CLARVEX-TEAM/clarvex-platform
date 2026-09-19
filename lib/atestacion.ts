/**
 * Procedencia del binario: demostrar que quien se registra es NUESTRA app.
 *
 * ⚠️ **Lo que hay hoy NO lo demuestra.** La vinculación desde la APK 1.5.1
 * prueba posesión de una llave P-256 presentada por una sesión válida: prueba
 * que quien firma tiene la llave, no de dónde salió el binario. Cualquiera con
 * una sesión podría presentar una llave suya. Está anotado desde entonces y no
 * hay que describirlo como atestación.
 *
 * ⚠️ **Y no se puede atestiguar una llave que ya existe.** Android solo permite
 * pedir la atestación AL GENERAR la llave, y la de firma existe en todos los
 * teléfonos registrados. Por eso la APK genera una llave desechable por intento,
 * con el reto del servidor dentro, y la de firma no se toca.
 *
 * Los estados son cuatro y ninguno bloquea todavía: esto se publica en modo
 * OBSERVAR. Encenderlo mal deja fuera equipos legítimos, que es el riesgo real.
 */

/** Lo que sabemos del origen de una instalación. */
export type Procedencia =
  /** Cadena verificada contra la raíz de Google. */
  | "VERIFICADO"
  /** El equipo no puede atestiguar: emulador, Android viejo, fabricante. */
  | "SIN_SOPORTE"
  /** Entregó cadena y NO cuadra. Lo más grave que puede aparecer aquí. */
  | "RECHAZADO"
  /** Gerencia lo aprobó a mano, sabiendo que no pudo atestiguar. */
  | "APROBADO_A_MANO"
  /** Todavía no lo ha intentado. */
  | "PENDIENTE";

export type ResultadoCadena =
  | { ok: true; nivel: "hardware" | "software"; raizConocida: boolean }
  | { ok: false; motivo: string };

/**
 * Qué procedencia le corresponde a una instalación.
 *
 * ⚠️ **«No pudo» y «no cuadra» son OPUESTOS y confundirlos es el fallo caro.**
 * Un teléfono sin atestación por hardware es normal --emuladores, gama baja,
 * algunos fabricantes-- y tiene que poder trabajar esperando aprobación. Una
 * cadena que no cuadra es la señal que esta función existe para dar.
 */
export function procedenciaDe(entrada: {
  cadena: ResultadoCadena | null;
  aprobadoPorGerencia: boolean;
}): Procedencia {
  if (entrada.cadena === null) {
    return entrada.aprobadoPorGerencia ? "APROBADO_A_MANO" : "PENDIENTE";
  }
  if (entrada.cadena.ok) return "VERIFICADO";
  /*
   * La aprobación de gerencia cubre «no pudo», nunca «no cuadra»: si alguien
   * presenta una cadena que no verifica, aprobarlo a mano sería firmar
   * exactamente lo que esto viene a detectar.
   */
  if (esFaltaDeSoporte(entrada.cadena.motivo)) {
    return entrada.aprobadoPorGerencia ? "APROBADO_A_MANO" : "SIN_SOPORTE";
  }
  return "RECHAZADO";
}

/** Motivos que significan «este equipo no puede», no «este equipo miente». */
const SIN_SOPORTE = [
  "sin atestación",
  "Android demasiado viejo",
  "no entregó cadena",
  "el teléfono no entregó cadena de atestación",
  "sin soporte"
];

export function esFaltaDeSoporte(motivo: string): boolean {
  const texto = motivo.toLowerCase();
  return SIN_SOPORTE.some((marca) => texto.includes(marca.toLowerCase()));
}

/**
 * Si esta procedencia debe impedir el registro.
 *
 * ⚠️ **Hoy devuelve `false` para todo salvo el rechazo, y ni eso está
 * encendido.** Se publica en modo observar: primero se mira qué reportan los
 * equipos reales de la tienda, y solo después se decide bloquear. Encenderlo a
 * ciegas deja fuera a quien trabaja.
 */
export function bloquea(procedencia: Procedencia, modo: "observar" | "exigir"): boolean {
  if (modo === "observar") return false;
  return procedencia === "RECHAZADO" || procedencia === "SIN_SOPORTE" || procedencia === "PENDIENTE";
}

/** Lo que se le enseña a gerencia en Dispositivos. */
export function comoSeDice(procedencia: Procedencia): { texto: string; tono: "bien" | "aviso" | "malo" } {
  switch (procedencia) {
    case "VERIFICADO":
      return { texto: "Origen verificado por el hardware", tono: "bien" };
    case "APROBADO_A_MANO":
      return { texto: "Aprobado por gerencia", tono: "aviso" };
    case "SIN_SOPORTE":
      return { texto: "Este equipo no puede verificar su origen", tono: "aviso" };
    case "PENDIENTE":
      return { texto: "Todavía no ha verificado su origen", tono: "aviso" };
    case "RECHAZADO":
      return { texto: "Su origen NO cuadra. Revísalo antes de confiar en él.", tono: "malo" };
  }
}
