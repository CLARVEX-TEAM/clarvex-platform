/**
 * `GET /api/chat/[id]/esperar?desde=<ISO>` — espera larga.
 *
 * El navegador pregunta «¿hay algo nuevo después de esta fecha?» y **el
 * servidor retiene la respuesta** hasta que lo haya o hasta que se agote el
 * plazo. Sustituye al sondeo cada 3 s del chat: en vez de preguntar veinte
 * veces por minuto y enterarse tarde, se pregunta una vez y se contesta en
 * cuanto pasa algo.
 *
 * Medido contra el sondeo de siempre: de hasta 3.000 ms a unos 400.
 *
 * ⚠️ **Solo avisa; no devuelve los mensajes.** Quien los trae sigue siendo el
 * `GET` de la sala, que además marca entregado y visto. Duplicar aquí esa
 * lógica significaría mantener dos sitios que generan recibos, y el día que se
 * separen nadie sabría cuál vale.
 *
 * Por qué esto y no SSE con `LISTEN/NOTIFY`: PM2 corre en cluster con dos
 * instancias, así que un mensaje escrito en una tiene que llegar a quien espera
 * en la otra. Con espera larga eso sale gratis —las dos preguntan a la misma
 * base—; con SSE haría falta un bus entre procesos (`pg` como dependencia
 * nueva) y desactivar el búfer del proxy, que hoy no está configurado.
 */

import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cuánto se retiene la respuesta.
 *
 * ⚠️ Tiene que quedar por debajo del tiempo de espera del proxy inverso, que
 * en Nginx Proxy Manager son 60 s por omisión. Pasarse haría que el proxy
 * cortara la petición y el navegador viera un error donde solo había silencio.
 */
const ESPERA_MS = 25_000;

/** Cada cuánto se mira la base mientras se espera. */
const LATIDO_MS = 400;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const miembro = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } },
    select: { id: true }
  });
  if (!miembro) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const crudo = new URL(req.url).searchParams.get("desde");
  const desde = crudo ? new Date(crudo) : null;
  if (!desde || Number.isNaN(desde.getTime())) {
    return NextResponse.json({ error: "Falta «desde»." }, { status: 400 });
  }

  const limite = Date.now() + ESPERA_MS;

  for (;;) {
    /*
     * `senderId` distinto: lo que uno mismo escribe ya lo pintó su pantalla al
     * enviarlo. Despertar por el propio mensaje provocaría una recarga inútil
     * justo después de escribir, que es cuando más se nota.
     */
    const nuevo = await prisma.chatMessage.findFirst({
      where: {
        roomId: id,
        createdAt: { gt: desde },
        senderId: { not: session.userId },
        hiddenFor: { none: { userId: session.userId } }
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" }
    });

    if (nuevo) {
      /*
       * Se devuelve la fecha del más reciente y la siguiente vuelta pide
       * `> esa fecha`. Si dos mensajes cayeran en el MISMO milisegundo, el
       * segundo no despertaría a nadie: lo recoge el refresco lento de la
       * pantalla, a los 15 s.
       *
       * Se acepta a sabiendas. Evitarlo pediría paginar por (fecha, id) en
       * ambos lados, y el caso exige dos personas escribiendo en el mismo
       * milisegundo en una tienda de cinco.
       */
      return NextResponse.json({ hay: true, hasta: nuevo.createdAt.toISOString() });
    }

    // Se corta si el navegador se fue: sin esto, cerrar la pestaña dejaría el
    // bucle consultando la base durante los 25 s completos, por cada pestaña.
    if (req.signal.aborted) return new NextResponse(null, { status: 499 });
    if (Date.now() >= limite) return NextResponse.json({ hay: false });

    await new Promise((r) => setTimeout(r, LATIDO_MS));
  }
}
