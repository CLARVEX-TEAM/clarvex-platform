import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enviarAvisoPorWhatsApp } from "@/lib/whatsapp-aviso";
import { enviarMediaPorWhatsApp } from "@/lib/whatsapp-media";
import { diezDigitosDelRemitente } from "@/lib/whatsapp-telefono";

/**
 * Webhook de Evolution API (mensajes entrantes de WhatsApp, evento MESSAGES_UPSERT).
 *
 * Bot de la tienda TH SAN AGUSTIN:
 *  1. Si el mensaje trae IMAGEN y el remitente es un empleado con cursos
 *     pendientes → se reenvía la foto a gerencia (Adrián e Itzel) avisando
 *     quién mandó evidencia y de qué curso.
 *  2. Si es TEXTO de un empleado conocido → responde la IA (Groq) con un tono
 *     de bot de tienda, recordando sus pendientes. Límite: 10 interacciones
 *     por empleado al día.
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
Hablas con empleados de la tienda. Tono: mexicano, amable, breve y directo (2-4 líneas máximo), con algún emoji.

Tu trabajo:
1. Recordar pendientes: limpieza, cursos y tareas del día.
2. Responder dudas sencillas de la operación (qué le toca hoy, horarios, a quién avisar). No inventes políticas ni precios; si no sabes algo, di que le pregunten a gerencia.
3. Si el empleado avisa que ya terminó algo (limpieza, curso, tarea), dile que mande la FOTO de evidencia aquí mismo y que tú se la pasas a gerencia.
4. SIEMPRE recuerda que el pendiente más importante es: ${LIMPIEZA}

Contexto del empleado (nombre, pendientes de hoy) te llega en cada mensaje. Úsalo para personalizar. No saludes con su nombre completo cada vez; sé natural.`;

type MensajeEntrante = {
  remoteJid: string;
  remoteJidAlt: string | null;
  fromMe: boolean;
  texto: string | null;
  tieneImagen: boolean;
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

  const pushName = data.pushName ? String(data.pushName) : null;
  if (!texto && !tieneImagen) return null;
  return { remoteJid, remoteJidAlt, fromMe, texto, tieneImagen, mediaMessage, pushName };
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

async function cursosPendientesTexto(userId: string): Promise<string> {
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
  return rows.map((r) => r.title).join(", ");
}

async function responderConIA(nombre: string, pendientes: string, historial: string[], mensaje: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL_FAST ?? "openai/gpt-oss-20b";

  const contexto = `Empleado: ${nombre}. Pendientes de hoy: ${pendientes || "sin pendientes registrados"}.`;
  const messages = [
    { role: "system", content: PROMPT_SISTEMA },
    { role: "system", content: contexto },
    ...historial.map((h, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: h
    })),
    { role: "user", content: mensaje }
  ];

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 220 }),
      signal: ac.signal
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    if (msg.tieneImagen) {
      const nombre = empleado.name ?? msg.pushName ?? telefono;
      const cursos = await cursosPendientesTexto(empleado.userId);
      const detalle = cursos ? ` de su curso "${cursos}"` : "";
      const base64 = await obtenerBase64Media(msg.mediaMessage);
      const caption = `📸 ${nombre} compartió evidencia${detalle}.`;

      const gerentes = await prisma.$queryRaw<Array<{ phone: string }>>`
        SELECT up.phone
        FROM "UserPhone" up
        JOIN "User" u ON u.id = up."userId"
        WHERE (LOWER(u.name) LIKE '%adrian%' OR LOWER(u.name) LIKE '%itzel%')
      `;

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

    // ── Caso 2: TEXTO = conversación con límite de 10/día ─────────────────
    if (!msg.texto) return NextResponse.json({ ok: true, ignorado: true });

    const conv = await prisma.$queryRaw<Array<{ id: string; interacciones: number; historial: string }>>`
      SELECT id, interacciones, historial
      FROM "BotConversation"
      WHERE phone = ${telefono} AND fecha = CURRENT_DATE
      LIMIT 1
    `;
    const actual = conv[0] ?? null;
    const interacciones = actual?.interacciones ?? 0;

    if (interacciones >= MAX_INTERACCIONES_DIA) {
      await enviarAvisoPorWhatsApp({
        phone: telefono,
        text: "Ya platicamos mucho hoy 😅 Si tienes alguna duda importante, mejor habla con gerencia. ¡A darle! 💪"
      });
      return NextResponse.json({ ok: true, accion: "limite" });
    }

    const cursos = await cursosPendientesTexto(empleado.userId);
    const pendientes = [LIMPIEZA, cursos ? `cursos pendientes: ${cursos}` : ""].filter(Boolean).join(" · ");
    const historial = actual ? (JSON.parse(actual.historial) as string[]) : [];

    const respuesta = await responderConIA(empleado.name ?? "compañero", pendientes, historial.slice(-6), msg.texto);
    if (!respuesta) return NextResponse.json({ ok: true, accion: "sin_ia" });

    await enviarAvisoPorWhatsApp({ phone: telefono, text: respuesta });

    const nuevoHistorial = [...historial, msg.texto, respuesta].slice(-12);
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
