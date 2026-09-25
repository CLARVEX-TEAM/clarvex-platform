import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { desdeDondeSeAbrio, rutaMedible } from "@/lib/metrica-pantallas";
import { prisma } from "@/lib/prisma";

/**
 * Apunta que alguien abrió una pantalla.
 *
 * ⚠️ **Esto NO puede estorbar a nadie.** Es una medición, no una captura: si
 * falla, se calla. Nunca devuelve un error que el cliente tenga que enseñar,
 * nunca reintenta y **jamás entra en la cola sin conexión** --la cola es FIFO y
 * una visita atascada delante dejaría una evidencia real esperando detrás--. Se
 * prefiere perder una fila de estadística a estorbar un segundo la operación.
 *
 * ⚠️ **El kiosko NO entra, y es deliberado.** El middleware ya le corta todo lo
 * que no sea `/api/checklist`, y aquí no se le abre una excepción: está
 * encerrado en una sola pantalla y lo que hace ya se sabe entero por las filas
 * de `ChecklistEntry`, así que medirlo no aportaría un dato nuevo. Abrirle una
 * escritura más al aparato menos protegido de la tienda a cambio de nada es
 * justo el descuido que ese comentario del middleware advierte. Sus peticiones
 * reciben 403 y el cliente las ignora, como cualquier otro fallo.
 *
 * ⚠️ Y el modo demo lo corta el middleware antes de llegar aquí --ninguna
 * escritura pasa--. La comprobación de abajo se queda igualmente: esta ruta no
 * puede depender de que otra capa siga estando.
 */

export const dynamic = "force-dynamic";

const cuerpo = z.object({
  ruta: z.string().max(300)
});

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  // El modo demo es una cuenta COMPARTIDA por todos los visitantes: sus visitas
  // no son uso de una tienda y ensuciarían justo lo que se quiere medir.
  if (session.demo) return new NextResponse(null, { status: 204 });

  const datos = await parseJson(request, cuerpo);
  if (datos.response) return datos.response;

  // ⚠️ Lo que manda el cliente NO se guarda: se traduce a un nombre de la lista.
  const ruta = rutaMedible(datos.data.ruta);
  if (!ruta) return new NextResponse(null, { status: 204 });

  try {
    await prisma.screenView.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        route: ruta,
        surface: desdeDondeSeAbrio(request.headers.get("user-agent"))
      }
    });
  } catch {
    // Si la base no acepta la fila, la estadística pierde un dato y ya. No se
    // registra ni se avisa: un error de telemetría en el log de producción es
    // ruido que tapa los que importan.
  }

  return new NextResponse(null, { status: 204 });
}
