/**
 * El caso de soporte, visto desde Clarvex.
 *
 * ⚠️ **Zendesk es el DUEÑO del caso; esto es una ventana.** Ahí trabajan los
 * agentes, ahí vive el estado y ahí se mide la atención. Es la decisión
 * CONTRARIA a la del espejo del chat de Slack --donde Clarvex es el dueño y
 * Slack la ventana-- y sale del mismo razonamiento: el dueño es quien de verdad
 * opera el dato. Tener dos dueños deja los lados distintos en cuanto falla una
 * petición, y entonces nadie sabe cuál vale.
 *
 * Aquí viven solo las decisiones, sin Prisma y sin red, que es lo único que se
 * puede probar. Lo mismo que `lib/cola-offline.ts` y `lib/portada.ts`.
 */

/** Estados que se le enseñan a la persona. Menos que los de Zendesk, a propósito. */
export type EstadoCaso = "nuevo" | "en-curso" | "esperando" | "resuelto";

/**
 * Traduce el estado de Zendesk al que se enseña.
 *
 * ⚠️ **`solved` y `closed` se dicen IGUAL.** Para Zendesk son distintos --uno se
 * puede reabrir y el otro no-- pero a quien reportó no le sirve la diferencia:
 * las dos significan «ya está». Enseñar la de Zendesk obligaría a explicar una
 * distinción del sistema de tickets a alguien que está en el piso de venta.
 *
 * ⚠️ **Un estado DESCONOCIDO no se inventa.** Zendesk puede agregar estados y
 * una traducción por omisión optimista diría «resuelto» sobre algo que no lo
 * está. Se cae a «en curso», que es lo que no promete nada.
 */
export function estadoDesdeZendesk(estado: string | null | undefined): EstadoCaso {
  switch ((estado ?? "").toLowerCase().trim()) {
    case "new":
      return "nuevo";
    case "open":
      return "en-curso";
    case "pending":
      return "esperando";
    case "hold":
      return "en-curso";
    case "solved":
    case "closed":
      return "resuelto";
    default:
      return "en-curso";
  }
}

export function comoSeDice(estado: EstadoCaso): { texto: string; tono: "bien" | "aviso" | "neutro" } {
  switch (estado) {
    case "nuevo":
      return { texto: "Recibido", tono: "neutro" };
    case "en-curso":
      return { texto: "En revisión", tono: "neutro" };
    case "esperando":
      // El matiz que SÍ importa: la pelota está del lado de la persona.
      return { texto: "Esperan tu respuesta", tono: "aviso" };
    case "resuelto":
      return { texto: "Resuelto", tono: "bien" };
  }
}

/** Si el caso sigue admitiendo respuestas de quien lo abrió. */
export function admiteRespuesta(estado: EstadoCaso): boolean {
  return estado !== "resuelto";
}

/**
 * El folio que se le enseña a la persona.
 *
 * ⚠️ **Se DERIVA del id de Zendesk, no se inventa.** Un contador propio se
 * separaría del suyo en cuanto se creara un ticket por fuera --por correo, por
 * teléfono-- y entonces el mismo caso tendría dos nombres. Es la misma razón por
 * la que el número de semana se lee de `Kpi.weekNumber` en vez de calcularlo.
 */
export function folioDe(zendeskId: number): string {
  if (!Number.isInteger(zendeskId) || zendeskId <= 0) throw new Error("Id de Zendesk inválido.");
  return `CS-${String(zendeskId).padStart(5, "0")}`;
}

export type MensajeDelCaso = {
  /** `true` si lo escribió quien abrió el caso. */
  mio: boolean;
  texto: string;
  fecha: string;
};

/**
 * Qué comentarios de Zendesk se le enseñan a quien abrió el caso.
 *
 * ⚠️ **Las notas INTERNAS no se enseñan nunca.** Zendesk las marca con
 * `public:false` y son donde los agentes hablan entre ellos. Que se filtre una
 * es el fallo caro de esta pantalla, y no daría ningún error: se vería como un
 * mensaje más.
 *
 * ⚠️ **Y se decide por `public`, no por quién lo escribió.** Un agente puede
 * escribir en público y quien reportó ve su respuesta; el mismo agente escribe
 * una nota interna dos minutos después. Filtrar por autor dejaría pasar la nota.
 *
 * ⚠️ **«Mío» son VARIAS identidades, no una.** Quien tiene correo real queda
 * registrado en Zendesk como solicitante y sus mensajes van a su nombre; quien
 * tiene el correo inventado `@clarvex.local` --once de dieciocho-- no existe
 * allí, así que lo suyo se publica a nombre de la cuenta de API de Clarvex. Con
 * una sola identidad, la mitad de los casos pintaría la conversación al revés:
 * la persona leyendo sus propias palabras como si se las hubiera dicho soporte.
 */
export function mensajesVisibles(
  comentarios: { public?: boolean; body?: string; created_at?: string; author_id?: number }[],
  autoresPropios: (number | null | undefined)[]
): MensajeDelCaso[] {
  const propios = new Set(autoresPropios.filter((id): id is number => typeof id === "number"));
  return comentarios
    .filter((c) => c.public === true && typeof c.body === "string" && c.body.trim().length > 0)
    .map((c) => ({
      mio: typeof c.author_id === "number" && propios.has(c.author_id),
      texto: (c.body ?? "").trim(),
      fecha: c.created_at ?? ""
    }));
}

/**
 * Cuánto tardó soporte en contestar por primera vez.
 *
 * ⚠️ **Devuelve `null` mientras no haya contestado, y eso NO es cero.** Un cero
 * se lee como «contestaron al instante», que es justo lo contrario de lo que
 * pasa cuando nadie ha contestado todavía. Es el mismo error que confundir «no
 * hay medición» con «está sano» en la telemetría del equipo.
 */
export function minutosHastaLaPrimeraRespuesta(
  abierto: Date,
  primeraRespuesta: Date | null | undefined
): number | null {
  if (!primeraRespuesta) return null;
  const minutos = Math.round((primeraRespuesta.getTime() - abierto.getTime()) / 60_000);
  // Un reloj desajustado no puede producir una atención negativa.
  return minutos < 0 ? 0 : minutos;
}

/** «hace 3 h», «hace 2 días». Para la lista de casos. */
export function hace(desde: Date, ahora: Date = new Date()): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 60_000));
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
