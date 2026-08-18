import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { suggestBodegaTagNumber } from "@/lib/cycle-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Agregar un marbete a un conteo YA ABIERTO. Solo BODEGA.
 *
 * El piso de venta se marbetea de antemano y su reparto no cambia a media
 * captura. La bodega sí: aparece una tarima, una caja o un rincón que nadie
 * había etiquetado, y hasta ahora la única salida era dejarlo fuera del conteo.
 *
 * El marbete se da de alta en el catálogo de la tienda (`CycleCountTag`), que
 * es de donde el conteo saca su lista. Por eso sale de inmediato en el conteo
 * abierto y queda disponible para los siguientes.
 */
const schema = z.object({
  // Sin número se asigna el siguiente libre. Con número manda el de la etiqueta
  // física, que es lo que se pega en el mueble.
  number: z.number().int().min(1).max(99999).optional(),
  label: z.string().max(60).optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const parsed = await parseJson(request, schema);
  if ("response" in parsed) return parsed.response;

  const count = await prisma.cycleCount.findFirst({ where: { id, storeId: session.storeId } });
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });
  // Un conteo cerrado es evidencia de inventario: sumarle un marbete después
  // cambiaría un resultado ya entregado.
  if (count.status !== "OPEN") {
    return NextResponse.json({ error: "El conteo esta cerrado; reabrelo para agregar marbetes." }, { status: 409 });
  }

  const catalog = await prisma.cycleCountTag.findMany({
    where: { storeId: session.storeId },
    select: { id: true, number: true, zone: true, active: true }
  });

  const number = parsed.data.number ?? suggestBodegaTagNumber(catalog);
  const existing = catalog.find((tag) => tag.number === number);

  let tag;
  let reactivated = false;
  if (existing && existing.active) {
    // Ya esta en la lista del conteo: no hay nada que agregar.
    return NextResponse.json(
      {
        error: existing.zone === "BODEGA"
          ? `El marbete ${number} ya esta en la lista de bodega.`
          : `El marbete ${number} ya existe en Piso de venta. Usa otro numero.`
      },
      { status: 409 }
    );
  } else if (existing) {
    // ⚠️ Existe pero DESACTIVADO. Se reactiva en vez de rechazar: el numero
    // esta ocupado en la base pero el marbete no se ve en el conteo, asi que
    // un error de «ya existe» manda a buscar algo invisible. Ademas su
    // etiqueta ya se imprimio en su dia, que es justo lo que se quiere reusar.
    tag = await prisma.cycleCountTag.update({
      where: { id: existing.id },
      data: {
        active: true,
        zone: "BODEGA",
        ...(parsed.data.label?.trim() ? { label: parsed.data.label.trim() } : {})
      }
    });
    reactivated = true;
  } else {
    try {
      tag = await prisma.cycleCountTag.create({
        data: { storeId: session.storeId, number, zone: "BODEGA", label: parsed.data.label?.trim() || null }
      });
    } catch {
      // Dos personas agregando a la vez: entre la lectura y el create el
      // numero pudo ocuparse. Lo atrapa el indice unico, no el chequeo.
      return NextResponse.json({ error: `El marbete ${number} acaba de darse de alta. Intenta con otro.` }, { status: 409 });
    }
  }
  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.tag.add",
    entity: "CycleCountTag",
    entityId: tag.id,
    detail: `Marbete ${number} ${reactivated ? "reactivado" : "agregado"} en bodega con el conteo del ${count.date.toISOString().slice(0, 10)} abierto`
  });

  return NextResponse.json({ tag: { id: tag.id, number: tag.number, zone: tag.zone, label: tag.label }, reactivated });
}
