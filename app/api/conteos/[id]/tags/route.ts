import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, isApiError, parseJson } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { nextFreeTagNumber } from "@/lib/cycle-count";
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
    select: { number: true, zone: true }
  });

  const number = parsed.data.number ?? nextFreeTagNumber(catalog.map((tag) => tag.number));
  const clash = catalog.find((tag) => tag.number === number);
  if (clash) {
    // El numero es unico por tienda, no por zona: decir en cual esta evita que
    // lo intenten tres veces seguidas.
    return NextResponse.json(
      { error: `El marbete ${number} ya existe en ${clash.zone === "PISO" ? "Piso de venta" : "Bodega"}.` },
      { status: 409 }
    );
  }

  let tag;
  try {
    tag = await prisma.cycleCountTag.create({
      data: { storeId: session.storeId, number, zone: "BODEGA", label: parsed.data.label?.trim() || null }
    });
  } catch {
    // Dos personas agregando a la vez: entre el findMany y el create el numero
    // pudo ocuparse. Lo atrapa el indice unico, no el chequeo de arriba.
    return NextResponse.json({ error: `El marbete ${number} acaba de darse de alta. Intenta con otro.` }, { status: 409 });
  }

  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.tag.add",
    entity: "CycleCountTag",
    entityId: tag.id,
    detail: `Marbete ${number} agregado a bodega con el conteo del ${count.date.toISOString().slice(0, 10)} abierto`
  });

  return NextResponse.json({ tag: { id: tag.id, number: tag.number, zone: tag.zone, label: tag.label } });
}
