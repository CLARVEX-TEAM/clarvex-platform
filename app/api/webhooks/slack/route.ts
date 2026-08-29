import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import {
  interpretarEntrante,
  parsearAutores,
  parsearCanales,
  tiendaDelCanal,
  verificarFirmaSlack,
  type EventoSlack
} from "@/lib/slack-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lo que se contesta desde Slack entra al chat de Clarvex.
 *
 * ⚠️ **Siempre se responde 200, pase lo que pase.** Slack reintenta tres veces
 * ante cualquier otra cosa y acaba desactivando la suscripción si insiste el
 * fallo; un mensaje que no supimos colocar no puede costar que dejen de
 * llegar los demás. Lo que no se pudo procesar se dice en el log, no en el
 * código HTTP.
 *
 * La única excepción es la firma: ahí sí se corta con 401, porque aceptar algo
 * sin verificar convertiría este endpoint público en un megáfono.
 */
export async function POST(request: Request) {
  // El cuerpo CRUDO, antes de parsear: la firma se calcula sobre los bytes
  // exactos, y `JSON.parse` + `stringify` los cambia.
  const crudo = await request.text();

  const firma = verificarFirmaSlack(
    crudo,
    request.headers.get("x-slack-signature"),
    request.headers.get("x-slack-request-timestamp")
  );
  if (!firma.ok) {
    console.warn(`[slack-webhook] firma rechazada: ${firma.motivo}`);
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let cuerpo: EventoSlack;
  try {
    cuerpo = JSON.parse(crudo) as EventoSlack;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const entrante = interpretarEntrante(cuerpo);

  // Slack comprueba la URL mandando un reto que hay que devolver tal cual.
  if (entrante.accion === "reto") {
    return new NextResponse(entrante.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (entrante.accion === "ignorar") return NextResponse.json({ ok: true });

  try {
    await colocar(entrante.canal, entrante.usuarioSlack, entrante.texto);
  } catch (error) {
    console.warn(`[slack-webhook] no se pudo colocar el mensaje: ${error instanceof Error ? error.message : ""}`);
  }
  return NextResponse.json({ ok: true });
}

async function colocar(canal: string, usuarioSlack: string, texto: string): Promise<void> {
  const canales = parsearCanales(process.env.SLACK_CHAT_CHANNELS);
  const storeId = tiendaDelCanal(canales, canal);
  if (!storeId) {
    console.warn(`[slack-webhook] el canal ${canal} no es de ninguna tienda`);
    return;
  }

  /*
   * ⚠️ Un remitente sin mapear se IGNORA, no se atribuye a nadie por omisión.
   * Un mensaje firmado por quien no lo escribió es peor que un mensaje perdido:
   * el equipo lo leería como si fuera de esa persona.
   */
  const autores = parsearAutores(process.env.SLACK_CHAT_AUTHORS);
  const employeeNumber = autores.get(usuarioSlack);
  if (!employeeNumber) {
    console.warn(`[slack-webhook] ${usuarioSlack} no esta en SLACK_CHAT_AUTHORS; se ignora`);
    return;
  }

  const autor = await prisma.user.findFirst({
    where: { employeeNumber, storeId },
    select: { id: true, name: true }
  });
  if (!autor) {
    console.warn(`[slack-webhook] no hay usuario ${employeeNumber} en ${storeId}`);
    return;
  }

  // La sala de grupo de esa tienda: es la única que se refleja.
  const sala = await prisma.chatRoom.findFirst({
    where: { storeId, type: "GROUP" },
    select: { id: true }
  });
  if (!sala) {
    console.warn(`[slack-webhook] ${storeId} no tiene sala de grupo`);
    return;
  }

  /*
   * ⚠️ Quien escribe tiene que ser MIEMBRO de la sala.
   *
   * No por permisos —viene de un canal que ya controlamos— sino porque el chat
   * lista y notifica por `ChatMember`: un mensaje de alguien que no está dentro
   * saldría sin que su autor pudiera verlo ni responder.
   */
  const miembro = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: sala.id, userId: autor.id } },
    select: { id: true }
  });
  if (!miembro) {
    console.warn(`[slack-webhook] ${autor.name} no es miembro de la sala de ${storeId}`);
    return;
  }

  const mensaje = await prisma.chatMessage.create({
    data: {
      roomId: sala.id,
      senderId: autor.id,
      body: texto,
      // Quien lo escribió ya lo tiene leído, igual que en el chat de la app.
      readBy: { create: { userId: autor.id } },
      deliveredTo: { create: { userId: autor.id } }
    },
    select: { id: true }
  });

  const otros = await prisma.chatMember.findMany({
    where: { roomId: sala.id, userId: { not: autor.id } },
    select: { userId: true }
  });
  if (otros.length > 0) {
    void dispatchPushToUsers(
      otros.map((m) => m.userId),
      {
        title: "Chat Todos",
        body: `${autor.name}: ${texto.slice(0, 80)}`,
        tag: `chat-${sala.id}`,
        url: `/chat/${sala.id}`
      }
    );
  }

  console.info(`[slack-webhook] mensaje ${mensaje.id} colocado en ${storeId} como ${autor.name}`);
}
