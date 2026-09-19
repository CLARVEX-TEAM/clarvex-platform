import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { EstadoCaso } from "@/lib/soporte";

export const dynamic = "force-dynamic";

/**
 * Los casos de quien pregunta. Solo los suyos.
 *
 * ⚠️ **Ni gerencia ve los casos de su equipo, y es deliberado.** Un caso de
 * soporte puede ser sobre el gerente --un horario, un trato, un descuento que
 * alguien pidió firmar--. Abrirlo a la gerencia convertiría el único canal
 * privado que tiene la persona en uno más donde la lee su jefe. Si algún día se
 * quiere un panel de tienda, que sea otra cosa y con su propia conversación.
 *
 * ⚠️ **No se consulta a Zendesk aquí.** Son hasta cinco casos por persona y
 * Zendesk limita peticiones por minuto: una lista que preguntara por cada caso
 * gastaría el límite y dejaría sin abrir el que de verdad se va a mirar. El
 * estado de la lista es la última copia, y se refresca al abrir el caso.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const casos = await prisma.supportCase.findMany({
    // Las dos condiciones a propósito: la tienda no sobra aunque el usuario ya
    // la determine. Es la misma defensa duplicada de `dispatchPushToUsers`.
    where: { userId: session.userId, storeId: session.storeId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      folio: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      firstReplyAt: true
    }
  });

  return NextResponse.json(
    {
      casos: casos.map((c) => ({
        id: c.id,
        folio: c.folio,
        asunto: c.subject,
        categoria: c.category,
        estado: c.status as EstadoCaso,
        abierto: c.createdAt.toISOString(),
        primeraRespuesta: c.firstReplyAt?.toISOString() ?? null
      }))
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
