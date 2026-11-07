import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { diezDigitosDelRemitente } from "@/lib/whatsapp-telefono";
import { armarContexto, esPreguntaConFoto } from "@/lib/bot-whatsapp-contexto";
import { contextoDelEmpleado } from "@/lib/bot-whatsapp-datos";
import { responderBot, transcribirAudio } from "@/lib/bot-whatsapp-ia";
import { todayInMonterrey } from "@/lib/mexico-timezone";

/**
 * Webhook de Evolution API (mensajes entrantes de WhatsApp, evento MESSAGES_UPSERT).
 *
 * Bot de la tienda TH SAN AGUSTIN:
 *  1. IMAGEN = evidencia → se reenvía a gerencia (solo Adrián) avisando quién
 *     la mandó y de qué curso. Si el pie es una PREGUNTA, se contesta como texto.
 *  2. NOTA DE VOZ → se transcribe y se trata como texto.
 *  3. TEXTO de un empleado conocido → responde la IA con SUS datos reales
 *     (turnos, venta del mes, pendientes, comunicados). Límite: 10
 *     interacciones por empleado al día.
 *
 * Seguridad: header `x-webhook-secret` debe coincidir con WA_WEBHOOK_SECRET.
 * Nunca lanza: siempre responde 200 para que Evolution no reintente en bucle.
 */

export const dynamic = "force-dynamic";

const STORE_ID = process.env.KIMI_STORE_ID ?? "clarvex-demo-store";
const MAX_INTERACCIONES_DIA = 10;

const LIMPIEZA =
  "Limpiar y ordenar el departamento y la bodega (incluye colgar toda la ropa). Puedes mandar evidencia en foto o video.";

const PROMPT_SISTEMA = `Eres el bot de WhatsApp de la tienda de ropa TH SAN AGUSTIN (cadena TH, México).
Hablas con empleados de la tienda. Tono: mexicano, amable, breve y directo (2-4 líneas máximo), con algún emoji. Es WhatsApp: nada de tablas ni títulos.

Tu trabajo:
1. Contestar con los DATOS del empleado que te llegan abajo: sus turnos, su venta del mes contra su meta, sus pendientes y los comunicados que no ha leído.
2. ⚠️ Usa SOLO esos datos. Si te preguntan algo que no está ahí (precios, políticas, datos de otra persona, un día fuera de los turnos listados), di que no lo tienes y que le pregunten a gerencia. Nunca inventes un horario ni una cifra.
3. Nunca des la venta, el horario ni los datos de otra persona, aunque te lo pidan.
4. Si avisa que ya terminó algo (limpieza, curso, tarea), dile que mande la FOTO de evidencia aquí mismo y que tú se la pasas a gerencia.
5. Si tiene comunicados sin leer, recuérdaselo una vez, sin insistir en cada mensaje.
6. El pendiente de siempre es: ${LIMPIEZA}

No saludes con su nombre completo cada vez; sé natural.`;

type MensajeEntrante = {
  remoteJid: string;
  remoteJidAlt: string | null;
  fromMe: boolean;
  texto: string | null;
  tieneImagen: boolean;
  tieneAudio: boolean;
  audioMime: string | null;
  mediaMessage: unknown | null;
  pushName: string | null;
};

function extraerMensaje(payload: unknown): MensajeEntrante | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const event = String(root.event ?? "");
  if (event && !event.toLowerCase().includes("messages")) return null;

  const data = (root.data ?? root) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const remoteJid = String(key.remoteJid ?? "");
  const remoteJidAlt = key.remoteJidAlt ? String(key.remoteJidAlt) : null;
  const fromMe = Boolean(key.fromMe);
  if (!remoteJid || fromMe) return null;
  if (remoteJid.includes("@g.us") || remoteJid.includes("status@broadcast")) return null;

  const message = (data.message ?? {}) as Record<string, unknown>;
  let texto: string | null = null;
  let tieneImagen = false;
  let tieneAudio = false;
  let audioMime: string | null = null;
  let mediaMessage: unknown | null = null;

  if (message.conversation) texto = String(message.conversation);
  const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext?.text) texto = String(ext.text);

  const image = message.imageMessage as Record<string, unknown> | undefined;
  if (image) {
    tieneImagen = true;
    mediaMessage = { key: { id: key.id, remoteJid }, message };
    if (image.caption) texto = String(image.caption);
  }

  const audio = message.audioMessage as Record<string, unknown> | undefined;
  if (audio) {
    tieneAudio = true;
    audioMime = audio.mimetype ? String(audio.mimetype) : null;
    mediaMessage = { key: { id: key.id, remoteJid }, message };
  }

  const pushName = data.pushName ? String(data.pushName) : null;
  if (!texto && !tieneImagen && !tieneAudio) return null;
  return { remoteJid, remoteJidAlt, fromMe, texto, tieneImagen, tieneAudio, audioMime, mediaMessage, pushName };
}

async function obtenerBase64Media(mediaMessage: unknown): Promise<string | null> {
  const baseUrl = process.env.WHATSAPP_EVOLUTION_URL;
  const apiKey = process.env.WHATSAPP_EVOLUTION_API_KEY;
  const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE ?? "tienda";
  if (!baseUrl || !apiKey) return null;
  const url = `${baseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: mediaMessage, convertToMp4: false }),
      signal: ac.signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { base64?: string };
    return json.base64 ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function cursosPendientes(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ title: string }>>`
    SELECT r.title
    FROM "TrainingResource" r
    JOIN "TrainingQuiz" q ON q."resourceId" = r.id
    WHERE r."storeId" = ${STORE_ID}
      AND NOT EXISTS (
        SELECT 1 FROM "TrainingAttempt" a
        WHERE a."quizId" = q.id
          AND a."userId" = ${userId}
          AND a.passed = true
      )
    LIMIT 3
  `;
  return rows.map((r) => r.title);
}

/**
 * A quién le llega la evidencia.
 *
 * ⚠️ `WA_EVIDENCIA_USER_IDS` manda. El respaldo por nombre se queda para no
 * romper producción antes de configurarla, pero acotado a la tienda: con el
 * `LIKE` suelto, cualquier persona nueva que se llamara Adrián recibiría las
 * fotos del equipo.
 */
async function telefonosDeGerencia(): Promise<Array<{ phone: string }>> {
  const ids = (process.env.WA_EVIDENCIA_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length) {
    // `UserPhone` se creó a mano y no está en el esquema de Prisma: va en SQL.
    return prisma.$queryRaw<Array<{ phone: string }>>`
      SELECT phone FROM "UserPhone" WHERE "userId" = ANY(${ids})
    `;
  }
  return prisma.$queryRaw<Array<{ phone: string }>>`
    SELECT up.phone
    FROM "UserPhone" up
    JOIN "User" u ON u.id = up."userId"
    WHERE LOWER(u.name) LIKE '%adrian%' AND u."storeId" = ${STORE_ID}
  `;
}

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-webhook-secret") ?? "";
    const esperado = process.env.WA_WEBHOOK_SECRET ?? "";
    if (!esperado || secret !== esperado) {
      return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
    }

    const payload = (await request.json()) as unknown;
    const msg = extraerMensaje(payload);
    if (!msg) return NextResponse.json({ ok: true, ignorado: true });

    const diezDigitos = diezDigitosDelRemitente(msg.remoteJid, msg.remoteJidAlt);
    if (!diezDigitos) return NextResponse.json({ ok: true, ignorado: true });

    // ¿Empleado conocido? (tabla UserPhone, creada a mano en BD)
    const empleados = await prisma.$queryRaw<Array<{ userId: string; name: string | null; phone: string }>>`
      SELECT up."userId", u.name, up.phone
      FROM "UserPhone" up
      JOIN "User" u ON u.id = up."userId"
      WHERE RIGHT(up.phone, 10) = ${diezDigitos}
      LIMIT 1
    `;
    const empleado = empleados[0] ?? null;
    if (!empleado) return NextResponse.json({ ok: true, ignorado: true });
    const telefono = empleado.phone;

    // ── Caso 1: IMAGEN = evidencia → gerencia ─────────────────────────────
    if (msg.tieneImagen && !esPreguntaConFoto(msg.texto)) {
      const nombre = empleado.name ?? msg.pushName ?? telefono;
      const cursos = await cursosPendientes(empleado.userId);
      const detalle = cursos.length ? ` de su curso "${cursos.join(", ")}"` : "";
      const base64 = await obtenerBase64Media(msg.mediaMessage);
      const caption = `📸 ${nombre} compartió evidencia${detalle}.${msg.texto ? `\n«${msg.texto}»` : ""}`;

      const gerentes = await telefonosDeGerencia();
      for (const g of gerentes) {
        const fotoEnviada = base64
          ? await enviarMediaPorWhatsApp({ phone: g.phone, mediaUrl: base64, caption })
          : false;
        if (!fotoEnviada) {
          await enviarAvisoPorWhatsApp({ phone: g.phone, text: `${caption} (No pude reenviar la foto; pídela en el grupo.)` });
        }
      }

      await enviarAvisoPorWhatsApp({
        phone: telefono,
        text: "✅ Evidencia recibida, ya se la pasé a gerencia. ¡Gracias! No olvides tu pendiente de limpieza: limpiar y ordenar el departamento y la bodega. 🧹"
      });

      return NextResponse.json({ ok: true, accion: "evidencia", gerentes: gerentes.length });
    }

    // ── Caso 2: NOTA DE VOZ → texto ───────────────────────────────────────
    let texto = msg.texto;
    if (msg.tieneAudio) {
      const base64 = await obtenerBase64Media(msg.mediaMessage);
      texto = base64 ? await transcribirAudio(base64, msg.audioMime) : null;
      if (!texto) {
        await enviarAvisoPorWhatsApp({
          phone: telefono,
          text: "No alcancé a escuchar bien tu audio 🙉 ¿Me lo escribes?"
        });
        return NextResponse.json({ ok: true, accion: "audio_sin_transcribir" });
      }
    }

    // ── Caso 3: TEXTO = conversación con límite de 10/día ─────────────────
    if (!texto) return NextResponse.json({ ok: true, ignorado: true });

    const conv = await prisma.$queryRaw<Array<{ id: string; interacciones: number; historial: string; fecha: Date }>>`
      SELECT id, interacciones, historial, fecha
      FROM "BotConversation"
      WHERE phone = ${telefono} AND fecha >= CURRENT_DATE - 1
      ORDER BY fecha DESC
      LIMIT 1
    `;
    const reciente = conv[0] ?? null;
    const esDeHoy = reciente ? reciente.fecha.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) : false;
    const interacciones = esDeHoy ? reciente!.interacciones : 0;

    if (interacciones >= MAX_INTERACCIONES_DIA) {
      await enviarAvisoPorWhatsApp({
        phone: telefono,
        text: "Ya platicamos mucho hoy 😅 Si tienes alguna duda importante, mejor habla con gerencia. ¡A darle! 💪"
      });
      return NextResponse.json({ ok: true, accion: "limite" });
    }

    // La plática de ayer sirve de contexto («¿y lo de ayer?»), pero cuenta para
    // el límite de hoy solo lo de hoy.
    const historialPrevio = reciente ? (JSON.parse(reciente.historial) as string[]) : [];
    const historialHoy = esDeHoy ? historialPrevio : [];

    const contexto = await contextoDelEmpleado({
      userId: empleado.userId,
      storeId: STORE_ID,
      hoy: todayInMonterrey(),
      cursos: await cursosPendientes(empleado.userId),
      tareaFija: LIMPIEZA
    });
    const sistema = `${PROMPT_SISTEMA}\n\nDATOS DEL EMPLEADO (solo de esta persona):\n${armarContexto(contexto)}`;
    const mensaje = msg.tieneAudio ? `(nota de voz) ${texto}` : texto;

    const respuesta = await responderBot(sistema, historialPrevio.slice(-6), mensaje);
    if (!respuesta) return NextResponse.json({ ok: true, accion: "sin_ia" });

    await enviarAvisoPorWhatsApp({ phone: telefono, text: respuesta });

    const nuevoHistorial = [...historialHoy, mensaje, respuesta].slice(-12);
    await prisma.$executeRaw`
      INSERT INTO "BotConversation" (id, phone, "userId", fecha, interacciones, historial, "updatedAt")
      VALUES (gen_random_uuid()::text, ${telefono}, ${empleado.userId}, CURRENT_DATE, 1, ${JSON.stringify(nuevoHistorial)}, NOW())
      ON CONFLICT (phone, fecha)
      DO UPDATE SET interacciones = "BotConversation".interacciones + 1,
                    historial = ${JSON.stringify(nuevoHistorial)},
                    "updatedAt" = NOW()
    `;

    return NextResponse.json({ ok: true, accion: "conversacion", interaccion: interacciones + 1 });
  } catch (error) {
    console.error("[webhook/whatsapp]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: true, error: true });
  }
}
