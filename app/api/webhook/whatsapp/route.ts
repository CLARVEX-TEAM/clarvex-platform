import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { diezDigitosDelRemitente } from "@/lib/whatsapp-telefono";
import { armarContexto, esPreguntaConFoto } from "@/lib/bot-whatsapp-contexto";
import { contextoDelEmpleado } from "@/lib/bot-whatsapp-datos";
import { responderBot, transcribirAudio } from "@/lib/bot-whatsapp-ia";
import { todayInMonterrey } from "@/lib/mexico-timezone";
import { mostrarEscribiendo, reaccionar } from "@/lib/whatsapp-gestos";
import { fotoDePendiente, telefonosDeGerencia, textoDePendiente } from "@/lib/bot-pendientes";
import { clasificarFoto } from "@/lib/foto-bot-ia";
import { registrarMarcaje } from "@/lib/marcaje-registro";
import { crearCodigoForms, FORMS_AXO, pideCodigoForms, URL_DEL_SCRIPT } from "@/lib/forms-axo";
import { resolveMonterreyDate } from "@/lib/cron-time";

/**
 * Webhook de Evolution API (mensajes entrantes de WhatsApp, evento MESSAGES_UPSERT).
 *
 * Bot de la tienda TH SAN AGUSTIN:
 *  1. IMAGEN → la IA dice qué es (`lib/foto-bot-ia.ts`):
 *     - la pantalla «Marcar entrada/salida» del POS → registra la asistencia y
 *       guarda la foto para el Forms de AXO;
 *     - certificado u otra → evidencia de su pendiente, que se reenvía a
 *       gerencia. Si no tiene pendientes y no es certificado, se le pregunta
 *       qué es en vez de reenviar una foto suelta.
 *     Si el pie es una PREGUNTA, se contesta como texto.
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
1. Contestar con los DATOS del empleado que te llegan abajo: sus turnos, su venta del mes contra su meta, su venta de CADA DÍA del mes, su COMISIÓN del mes, sus pendientes y los comunicados que no ha leído.
   Si pregunta cuánto lleva o cómo va por día, dale el desglose de los días que pida, uno por renglón, con *negritas* en las cifras.
   Cada día viene con su estado. «no vendió» y «descanso» SÍ están capturados: cuéntalos así ($0 o descanso), nunca digas que faltan. Solo «la tienda aún no captura ese día» es falta de captura, y normalmente es hoy o ayer.
   Si pregunta por su comisión: cuánto lleva, a qué porcentaje, su alcance contra el mínimo y cuánto le falta para el siguiente nivel. Son los mismos números de la pestaña Comisión de la app.
2. ⚠️ Usa SOLO esos datos. Si te preguntan algo que no está ahí (precios, políticas, datos de otra persona, un día fuera de los turnos listados), di que no lo tienes y que le pregunten a gerencia. Nunca inventes un horario ni una cifra.
3. Si es ASESOR, nunca des la venta, la comisión, el horario ni los datos de otra persona, aunque te lo pidan. GERENTE y SUBGERENTE sí pueden consultar la venta y la comisión de cada asesor: vienen en sus datos.
4. Si quiere reportar avance de un pendiente o curso, dile que mande la FOTO aquí mismo: se guarda en su pendiente y queda en progreso. Cuando termine, que mande su certificado y escriba *terminé*; gerencia lo revisa y lo cierra. Él no lo puede cerrar.
5. Si pregunta por los donativos de Tailored Help, dile cuánto va la tienda contra la meta de la semana y cuánto lleva él; anímalo sin presionar. La meta es de la tienda, no de cada quien.
6. Si tiene comunicados sin leer, recuérdaselo una vez, sin insistir en cada mensaje.
7. El pendiente de siempre es: ${LIMPIEZA}

No saludes con su nombre completo cada vez; sé natural.`;

type MensajeEntrante = {
  id: string;
  remoteJid: string;
  remoteJidAlt: string | null;
  fromMe: boolean;
  texto: string | null;
  tieneImagen: boolean;
  /** Tipo del archivo: la foto o el PDF (los certificados de Crehana llegan en PDF). */
  mediaMime: string;
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
  let mediaMime = "image/jpeg";
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
    if (image.mimetype) mediaMime = String(image.mimetype);
    if (image.caption) texto = String(image.caption);
  }

  // Un PDF o una imagen mandados como DOCUMENTO cuentan igual que una foto: así
  // llegan los certificados. Con pie, WhatsApp los envuelve en otro mensaje.
  const conPie = message.documentWithCaptionMessage as { message?: Record<string, unknown> } | undefined;
  const documento = (message.documentMessage ?? conPie?.message?.documentMessage) as Record<string, unknown> | undefined;
  const mimeDocumento = documento?.mimetype ? String(documento.mimetype) : "";
  if (documento && (mimeDocumento.includes("pdf") || mimeDocumento.startsWith("image/"))) {
    tieneImagen = true;
    mediaMime = mimeDocumento;
    mediaMessage = { key: { id: key.id, remoteJid }, message };
    if (documento.caption) texto = String(documento.caption);
  }

  const audio = message.audioMessage as Record<string, unknown> | undefined;
  if (audio) {
    tieneAudio = true;
    audioMime = audio.mimetype ? String(audio.mimetype) : null;
    mediaMessage = { key: { id: key.id, remoteJid }, message };
  }

  const pushName = data.pushName ? String(data.pushName) : null;
  if (!texto && !tieneImagen && !tieneAudio) return null;
  return { id: String(key.id ?? ""), remoteJid, remoteJidAlt, fromMe, texto, tieneImagen, mediaMime, tieneAudio, audioMime, mediaMessage, pushName };
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
      if (msg.id) await reaccionar({ remoteJid: msg.remoteJid, id: msg.id }, "✅");
      const nombre = empleado.name ?? msg.pushName ?? telefono;
      const base64 = await obtenerBase64Media(msg.mediaMessage);

      // ¿Qué es? Si la IA no contesta, sigue el camino de siempre.
      const clase = base64 ? await clasificarFoto(base64, msg.mediaMime) : null;
      if (clase?.tipo === "marcaje" && clase.marcaje && base64) {
        const marcaje = await registrarMarcaje({
          storeId: STORE_ID,
          remitente: { userId: empleado.userId, name: empleado.name },
          lectura: clase.marcaje,
          hoy: resolveMonterreyDate().dateKey,
          base64,
          mime: msg.mediaMime
        }).catch((error) => {
          console.error("[webhook/whatsapp] marcaje", error instanceof Error ? error.message : error);
          return { respuesta: "No pude registrar tu asistencia 😓 Mándame la foto otra vez en un momento.", registrado: false };
        });
        await enviarAvisoPorWhatsApp({ phone: telefono, text: marcaje.respuesta });
        return NextResponse.json({ ok: true, accion: "marcaje", registrado: marcaje.registrado });
      }

      // La foto se guarda en su pendiente (y lo pasa a en proceso) si tiene alguno abierto.
      const pendiente = await fotoDePendiente(STORE_ID, { userId: empleado.userId, name: empleado.name, phone: telefono }, base64, msg.texto, msg.mediaMime).catch((error) => {
        console.error("[webhook/whatsapp] evidencia en pendiente", error instanceof Error ? error.message : error);
        return null;
      });
      // Ni marcaje, ni certificado, ni pendiente abierto: se pregunta en vez de
      // mandarle a gerencia una foto que nadie sabe de qué es.
      if (!pendiente && clase?.tipo === "otra") {
        await enviarAvisoPorWhatsApp({
          phone: telefono,
          text: "📸 Recibí tu foto, ¿de qué es?\n• Si es tu *entrada*, mándame la foto de la pantalla *Marcar entrada* del POS.\n• Si es *evidencia* de un pendiente o curso, dime de cuál."
        });
        return NextResponse.json({ ok: true, accion: "foto_sin_tipo" });
      }
      const cursos = pendiente?.titulo ? [pendiente.titulo] : await cursosPendientes(empleado.userId);
      const detalle = cursos.length ? ` de «${cursos.join(", ")}»` : "";
      const enApp = pendiente?.titulo ? " (guardada en la app, en progreso)" : "";
      const caption = `📸 ${nombre} compartió evidencia${detalle}${enApp}.${msg.texto ? `
«${msg.texto}»` : ""}`;

      // Si ya pidió cierre con esta foto, gerencia la recibió en ese aviso.
      const gerentes = pendiente?.gerenciaAvisada ? [] : await telefonosDeGerencia(STORE_ID);
      for (const g of gerentes) {
        const fotoEnviada = base64
          ? await enviarMediaPorWhatsApp({
              phone: g.phone,
              mediaUrl: base64,
              caption,
              mimetype: msg.mediaMime,
              fileName: msg.mediaMime.includes("pdf") ? "certificado.pdf" : "evidencia.jpg"
            })
          : false;
        if (!fotoEnviada) {
          await enviarAvisoPorWhatsApp({ phone: g.phone, text: `${caption} (No pude reenviar la foto; pídela en el grupo.)` });
        }
      }

      await enviarAvisoPorWhatsApp({
        phone: telefono,
        text: pendiente?.respuesta ?? "✅ Evidencia recibida, ya se la pasé a gerencia. ¡Gracias! No olvides tu pendiente de limpieza: limpiar y ordenar el departamento y la bodega. 🧹"
      });

      return NextResponse.json({ ok: true, accion: "evidencia", gerentes: gerentes.length });
    }

    // ── Caso 2: NOTA DE VOZ → texto ───────────────────────────────────────
    // Desde aquí el bot va a pensar (transcribir, consultar, contestar): que se vea.
    mostrarEscribiendo(msg.remoteJid);
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

    // «código forms»: el código personal del botón que llena el Forms de AXO.
    // Solo gerencia de una tienda con el Forms configurado.
    if (pideCodigoForms(texto)) {
      const quien = await prisma.user.findUnique({
        where: { id: empleado.userId },
        select: { id: true, storeId: true, role: true, active: true, sessionVersion: true }
      });
      const puede = quien?.active && (quien.role === "GERENTE" || quien.role === "SUBGERENTE") && FORMS_AXO[quien.storeId];
      if (!quien || !puede) {
        await enviarAvisoPorWhatsApp({ phone: telefono, text: "El código del Forms es solo para gerencia 🙏" });
        return NextResponse.json({ ok: true, accion: "codigo_forms_negado" });
      }
      const codigo = await crearCodigoForms({ id: quien.id, storeId: quien.storeId, sessionVersion: quien.sessionVersion });
      await enviarAvisoPorWhatsApp({
        phone: telefono,
        text: `🔑 Tu código para el botón *Llenar desde Clarvex* del Forms. Vale 6 meses y es *solo tuyo*: no lo reenvíes.

1. Si no lo tienes, instala el script: ${URL_DEL_SCRIPT}
2. Abre el Forms, pica el botón y pega el código cuando te lo pida.

El código va en el siguiente mensaje 👇`
      });
      await enviarAvisoPorWhatsApp({ phone: telefono, text: codigo });
      return NextResponse.json({ ok: true, accion: "codigo_forms" });
    }

    // Pendientes: el número de una lista, «terminé» o el «sí» de gerencia. No
    // gasta interacciones: es operación, no plática.
    const dePendiente = await textoDePendiente(STORE_ID, { userId: empleado.userId, name: empleado.name, phone: telefono }, texto).catch((error) => {
      console.error("[webhook/whatsapp] pendiente", error instanceof Error ? error.message : error);
      return null;
    });
    if (dePendiente) {
      await enviarAvisoPorWhatsApp({ phone: telefono, text: dePendiente });
      return NextResponse.json({ ok: true, accion: "pendiente" });
    }

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
