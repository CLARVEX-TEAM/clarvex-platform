import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { admiteRespuesta, estadoDesdeZendesk, mensajesVisibles, minutosHastaLaPrimeraRespuesta } from "@/lib/soporte";
import { idDeNuestraCuenta, leerComentarios, leerTicket, responderTicket, ZENDESK_ENABLED } from "@/lib/zendesk";
import { claveDeLaPeticion, conIdempotencia } from "@/lib/idempotencia-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Un caso, con su conversación.
 *
 * ⚠️ **La autorización es NUESTRA, nunca el id del ticket.** Se busca la fila de
 * `SupportCase` por su id Y por el dueño; solo si aparece se usa su `zendeskId`.
 * Aceptar un id de ticket del cliente dejaría abrir el caso de cualquiera
 * probando números, y una etiqueta `store-xxx` dentro del ticket no es una
 * frontera de seguridad: es una etiqueta.
 */
async function casoDelUsuario(id: string, userId: string, storeId: string) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  return prisma.supportCase.findFirst({
    where: { id, userId, storeId },
    select: {
      id: true, zendeskId: true, folio: true, subject: true, category: true,
      status: true, createdAt: true, firstReplyAt: true
    }
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const { id } = await params;

  const caso = await casoDelUsuario(id, session.userId, session.storeId);
  if (!caso) return NextResponse.json({ error: "Ese caso no existe." }, { status: 404 });

  const base = {
    id: caso.id,
    folio: caso.folio,
    asunto: caso.subject,
    categoria: caso.category,
    abierto: caso.createdAt.toISOString()
  };

  if (!ZENDESK_ENABLED) {
    return NextResponse.json(
      { ...base, estado: caso.status, mensajes: [], atencionMinutos: null, alDia: false },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const [ticket, comentarios, cuentaPropia] = await Promise.all([
    leerTicket(caso.zendeskId),
    leerComentarios(caso.zendeskId),
    idDeNuestraCuenta()
  ]);

  /*
   * ⚠️ Si Zendesk no contesta se enseña la última copia y se DICE que no está
   * al día. Inventar «resuelto» o dejar la pantalla vacía son las dos formas de
   * mentir aquí: una cierra un caso abierto y la otra hace desaparecer el caso.
   */
  if (!ticket || !comentarios) {
    return NextResponse.json(
      { ...base, estado: caso.status, mensajes: [], atencionMinutos: null, alDia: false },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const estado = estadoDesdeZendesk(ticket.status);
  /*
   * «Mío» son varias identidades: quien tiene correo real figura como
   * solicitante del ticket; quien tiene el correo inventado `@clarvex.local` no
   * existe en Zendesk y lo suyo sale a nombre de nuestra cuenta de API.
   */
  const mensajes = mensajesVisibles(comentarios, [cuentaPropia, ticket.requester_id]);
  const primeraDeSoporte = mensajes.find((m) => !m.mio);
  const firstReplyAt = caso.firstReplyAt ?? (primeraDeSoporte?.fecha ? new Date(primeraDeSoporte.fecha) : null);

  // La copia se actualiza en silencio; es caché, no la verdad.
  if (estado !== caso.status || (firstReplyAt && !caso.firstReplyAt)) {
    await prisma.supportCase
      .update({
        where: { id: caso.id },
        data: { status: estado, syncedAt: new Date(), ...(firstReplyAt ? { firstReplyAt } : {}) }
      })
      .catch(() => undefined);
  }

  return NextResponse.json(
    {
      ...base,
      estado,
      mensajes,
      atencionMinutos: minutosHastaLaPrimeraRespuesta(caso.createdAt, firstReplyAt),
      puedeResponder: admiteRespuesta(estado),
      alDia: true
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

const respuesta = z.object({ mensaje: z.string().trim().min(2, "Escribe tu respuesta.").max(4000) });

/**
 * Responder al caso.
 *
 * ⚠️ **Con guarda de idempotencia.** Publicar un comentario NO es inofensivo de
 * repetir: un reintento deja el mismo mensaje dos veces en la conversación que
 * lee soporte. Y reintentar es justo lo que hace la cola sin señal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const { id } = await params;

  const caso = await casoDelUsuario(id, session.userId, session.storeId);
  if (!caso) return NextResponse.json({ error: "Ese caso no existe." }, { status: 404 });

  const parsed = await parseJson(request, respuesta);
  if ("response" in parsed) return parsed.response;

  if (!admiteRespuesta(caso.status as never)) {
    return NextResponse.json({ error: "Este caso ya está resuelto. Abre uno nuevo." }, { status: 409 });
  }

  const resultado = await conIdempotencia(
    {
      clave: claveDeLaPeticion(request),
      storeId: session.storeId,
      userId: session.userId,
      route: `/api/support/casos/${caso.id}`,
      cuerpo: { mensaje: parsed.data.mensaje }
    },
    async () => {
      const ok = await responderTicket(caso.zendeskId, parsed.data.mensaje);
      return ok
        ? { status: 200, body: { ok: true } }
        : { status: 502, body: { error: "No se pudo enviar tu respuesta. Se reintentará." } };
    }
  );
  return NextResponse.json(resultado.body, { status: resultado.status });
}
