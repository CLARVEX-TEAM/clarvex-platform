import crypto from "node:crypto";

/**
 * El espejo entre el chat de Clarvex y un canal de Slack.
 *
 * Para qué: el equipo entra a Clarvex con su PIN y **once de dieciocho no
 * tienen correo real** (`<número>@clarvex.local`), así que no se les puede
 * invitar a Slack. El espejo deja a cada quien donde ya está — ellos en
 * Clarvex, la gerencia en Slack — sin obligar a nadie a mudarse.
 *
 * ⚠️ **Clarvex es el dueño del mensaje; Slack es una ventana.** No se
 * sincronizan ediciones, borrados, hilos ni reacciones. Un espejo simple que
 * siempre dice la verdad vale más que un sincronizador listo que a veces
 * miente, y con dos dueños del mismo dato eso es cuestión de tiempo.
 *
 * Aquí no hay red ni Prisma: son las decisiones, que es lo que hay que poder
 * probar. La llamada vive en `lib/slack.ts` y el endpoint en
 * `app/api/webhooks/slack/route.ts`.
 */

/* ─── a qué canal va cada tienda ──────────────────────────────────────────── */

/**
 * `SLACK_CHAT_CHANNELS=clarvex-demo-store=C09ABC,otra-tienda=C09DEF`
 *
 * Va en una variable y no en la tabla `Store` a propósito: es un experimento y
 * quitarlo tiene que costar una línea, no una migración. Si se queda, se mueve.
 */
export function parsearCanales(raw: string | undefined): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const par of (raw ?? "").split(",")) {
    const [tienda, canal] = par.split("=").map((s) => s.trim());
    if (tienda && canal) mapa.set(tienda, canal);
  }
  return mapa;
}

/** El inverso: de canal de Slack a tienda, para lo que llega de vuelta. */
export function tiendaDelCanal(canales: Map<string, string>, canal: string): string | null {
  for (const [tienda, suyo] of canales) if (suyo === canal) return tienda;
  return null;
}

/**
 * `SLACK_CHAT_AUTHORS=U08ABC=102259,U08DEF=81893`
 *
 * De quién de Slack a qué número de empleado de Clarvex.
 *
 * ⚠️ Un remitente que no esté en el mapa **se ignora**, no se atribuye a nadie
 * por omisión. Meter un mensaje con un autor inventado es peor que perderlo:
 * el equipo leería algo firmado por quien no lo escribió.
 */
export function parsearAutores(raw: string | undefined): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const par of (raw ?? "").split(",")) {
    const [slack, empleado] = par.split("=").map((s) => s.trim());
    if (slack && empleado) mapa.set(slack, empleado);
  }
  return mapa;
}

/* ─── qué se refleja y qué no ─────────────────────────────────────────────── */

export type SalaParaEspejo = { id: string; tipo: "DIRECT" | "GROUP"; storeId: string };

/**
 * `SLACK_DM_CHANNELS=<idDeSala>=C09ABC,<otra>=C09DEF`
 *
 * Un canal PRIVADO de Slack por cada chat directo, no uno compartido para
 * todos. Con uno solo, todas las conversaciones caerían mezcladas y una
 * respuesta no tendría destinatario: no se sabría a quién va. Un canal por
 * conversación cuesta configurarlo una vez y hace imposible equivocarse.
 */
export function parsearSalasDirectas(raw: string | undefined): Map<string, string> {
  return parsearCanales(raw);
}

/** El inverso, para lo que llega de Slack. */
export function salaDelCanal(directos: Map<string, string>, canal: string): string | null {
  return tiendaDelCanal(directos, canal);
}

/**
 * A qué canal va una sala, si va a alguno.
 *
 * ⚠️ **Un `DIRECT` es privado entre dos personas.** Solo se refleja el que
 * está mapeado explícitamente, y quien lo lea desde Slack tiene que ser
 * **miembro de esa sala** — eso lo comprueba quien llama, contra la base, no
 * contra la variable de entorno. En la tienda existe un chat entre dos asesoras
 * en el que la gerencia no participa: reflejarlo sería publicar algo que nadie
 * eligió publicar.
 */
export function canalPara(
  sala: SalaParaEspejo,
  canales: Map<string, string>,
  directos: Map<string, string> = new Map()
): string | null {
  if (sala.tipo === "GROUP") return canales.get(sala.storeId) ?? null;
  return directos.get(sala.id) ?? null;
}

/* ─── lo que llega de Slack ───────────────────────────────────────────────── */

export type EventoSlack = {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    app_id?: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
  };
};

export type Entrante =
  | { accion: "reto"; challenge: string }
  | { accion: "ignorar"; porque: string }
  | { accion: "mensaje"; canal: string; usuarioSlack: string; texto: string; ts: string };

/** Tope del cuerpo, igual que el del chat de la app. */
const MAX = 1000;

/**
 * Decide qué hacer con lo que manda Slack.
 *
 * ⚠️ **El eco es el fallo clásico de un espejo** y se corta aquí: todo lo que
 * traiga `bot_id` o `app_id` lo publicamos nosotros, así que se ignora. Sin eso,
 * cada mensaje rebotaría entre los dos sistemas hasta llenar el canal solo.
 */
export function interpretarEntrante(cuerpo: EventoSlack): Entrante {
  if (cuerpo.type === "url_verification") {
    return typeof cuerpo.challenge === "string"
      ? { accion: "reto", challenge: cuerpo.challenge }
      : { accion: "ignorar", porque: "reto sin challenge" };
  }
  if (cuerpo.type !== "event_callback") return { accion: "ignorar", porque: `tipo ${cuerpo.type ?? "(vacio)"}` };

  const e = cuerpo.event;
  if (!e || e.type !== "message") return { accion: "ignorar", porque: `evento ${e?.type ?? "(vacio)"}` };
  if (e.bot_id || e.app_id) return { accion: "ignorar", porque: "es nuestro propio eco" };
  // Ediciones, borrados, entradas al canal, ficheros... nada de eso es un
  // mensaje nuevo, y tratarlos como tal duplicaría o inventaría contenido.
  if (e.subtype) return { accion: "ignorar", porque: `subtipo ${e.subtype}` };
  if (e.thread_ts && e.thread_ts !== e.ts) return { accion: "ignorar", porque: "respuesta en hilo" };

  const texto = (e.text ?? "").trim();
  if (!texto) return { accion: "ignorar", porque: "sin texto" };
  if (!e.user || !e.channel || !e.ts) return { accion: "ignorar", porque: "sin remitente, canal o marca de tiempo" };

  return {
    accion: "mensaje",
    canal: e.channel,
    usuarioSlack: e.user,
    texto: texto.slice(0, MAX),
    ts: e.ts
  };
}

/* ─── la firma de Slack ───────────────────────────────────────────────────── */

export type FirmaSlack = { ok: true } | { ok: false; motivo: "sin-secreto" | "sin-firma" | "caducada" | "no-coincide" };

/** Cinco minutos, el margen que recomienda Slack contra reenvíos. */
const VENTANA_S = 60 * 5;

/**
 * Verifica la firma, y **devuelve un motivo, no un booleano**.
 *
 * Es la misma lección que con Mercado Pago: `sin-secreto` es un error de
 * configuración nuestro que tira TODO, y `no-coincide` es la defensa
 * funcionando. Con un booleano las dos escriben la misma línea en el log, que
 * es justo la que hace pensar en un atacante y no en un `.env` incompleto.
 */
export function verificarFirmaSlack(
  cuerpoCrudo: string,
  firma: string | null,
  timestamp: string | null,
  opciones: { secret?: string; ahora?: number } = {}
): FirmaSlack {
  const secret = opciones.secret ?? process.env.SLACK_SIGNING_SECRET;
  if (!secret) return { ok: false, motivo: "sin-secreto" };
  if (!firma || !timestamp) return { ok: false, motivo: "sin-firma" };

  const ts = Number(timestamp);
  const ahora = Math.floor((opciones.ahora ?? Date.now()) / 1000);
  if (!Number.isFinite(ts) || Math.abs(ahora - ts) > VENTANA_S) return { ok: false, motivo: "caducada" };

  const esperada = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${cuerpoCrudo}`).digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma))
      ? { ok: true }
      : { ok: false, motivo: "no-coincide" };
  } catch {
    // Longitudes distintas: `timingSafeEqual` lanza en vez de devolver false.
    return { ok: false, motivo: "no-coincide" };
  }
}
