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
  // Varios de golpe: es el caso de volver a habilitar un tramo entero que se
  // habia apagado (el 136 al 160 en TH SAN AGUSTIN). Uno por uno son 25
  // viajes y 25 oportunidades de teclear mal.
  numbers: z.array(z.number().int().min(1).max(99999)).min(1).max(200).optional(),
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

  // Uno, varios, o —sin nada— el que sugiere el servidor.
  const wanted = parsed.data.numbers ?? [parsed.data.number ?? suggestBodegaTagNumber(catalog)];
  const unique = Array.from(new Set(wanted)).sort((left, right) => left - right);
  // La etiqueta solo tiene sentido pidiendo UN marbete: una sola descripcion
  // repetida en veinte muebles no dice donde esta ninguno.
  const label = unique.length === 1 ? parsed.data.label?.trim() || null : null;

  const added: number[] = [];
  const reactivated: number[] = [];
  const skipped: number[] = [];

  for (const number of unique) {
    const existing = catalog.find((tag) => tag.number === number);
    if (existing && existing.active) {
      // Ya esta en la lista. Pidiendo uno solo se avisa; en lote se ignora,
      // que es lo que espera quien selecciona un tramo entero.
      if (unique.length === 1) {
        return NextResponse.json(
          {
            error: existing.zone === "BODEGA"
              ? `El marbete ${number} ya esta en la lista de bodega.`
              : `El marbete ${number} ya existe en Piso de venta. Usa otro numero.`
          },
          { status: 409 }
        );
      }
      skipped.push(number);
      continue;
    }
    if (existing) {
      // ⚠️ Existe pero DESACTIVADO: se reactiva. El numero esta ocupado en la
      // base pero el marbete no se ve en el conteo, asi que un error de «ya
      // existe» manda a buscar algo invisible. Y su etiqueta ya se imprimio en
      // su dia, que es justo lo que se quiere reusar.
      await prisma.cycleCountTag.update({
        where: { id: existing.id },
        data: { active: true, zone: "BODEGA", ...(label ? { label } : {}) }
      });
      reactivated.push(number);
      continue;
    }
    try {
      await prisma.cycleCountTag.create({
        data: { storeId: session.storeId, number, zone: "BODEGA", label }
      });
      added.push(number);
    } catch {
      // Dos personas agregando a la vez: entre la lectura y el create el
      // numero pudo ocuparse. Lo atrapa el indice unico, no el chequeo.
      if (unique.length === 1) {
        return NextResponse.json({ error: `El marbete ${number} acaba de darse de alta. Intenta con otro.` }, { status: 409 });
      }
      skipped.push(number);
    }
  }

  if (added.length === 0 && reactivated.length === 0) {
    return NextResponse.json({ error: "Esos marbetes ya estaban en la lista." }, { status: 409 });
  }
  await recordAudit({
    session,
    storeId: session.storeId,
    action: "cyclecount.tag.add",
    entity: "CycleCountTag",
    entityId: null,
    detail: `Bodega, conteo del ${count.date.toISOString().slice(0, 10)} abierto: ${added.length} marbete(s) agregado(s), ${reactivated.length} reactivado(s)`
  });

  return NextResponse.json({ added, reactivated, skipped });
}
