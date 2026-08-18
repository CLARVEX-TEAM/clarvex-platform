import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { matchPosRows, posCaptureRows } from "@/lib/pos-productivity";
import { isVisionConfigured, readPosReport } from "@/lib/pos-vision";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lee el reporte diario «Productividad del vendedor» del POS y devuelve las
 * filas listas para revisar: venta, tickets, piezas, bruto y descuento por
 * asesor.
 *
 * **No escribe NADA.** El guardado sigue siendo el de siempre
 * (`POST /api/admin/capture/kpis`), después de que quien captura vea la vista
 * previa. Leer y guardar separados es lo que permite confiar en una lectura
 * automática: si algo salió mal, se ve antes de que toque la base.
 *
 * Todo lo leído pasa por `posCaptureRows`, que comprueba las cuatro cuentas
 * internas del reporte. Un dígito mal leído rompe alguna y la carga se detiene.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  // Captura del visor (~100 KB) o el PDF exportado (~32 KB). El techo deja margen.
  imageBase64: z.string().min(1).max(12_000_000),
  // Captura de pantalla o el PDF exportado: el lector acepta los dos.
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]).default("image/png")
});

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  if (!isVisionConfigured()) {
    return NextResponse.json({ error: "La lectura de capturas no está configurada en el servidor." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cuerpo invalido.", detail: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const document = parsed.data.imageBase64.replace(/^data:.*?;base64,/, "");
  const read = await readPosReport(document, parsed.data.mimeType);
  if (!read.ok) {
    return NextResponse.json({ error: "No se pudo leer el reporte.", detail: [read.error] }, { status: 422 });
  }

  const converted = posCaptureRows(read.value);
  if (!converted.ok) {
    return NextResponse.json({ error: "La lectura no cuadra.", detail: converted.error.split("\n") }, { status: 422 });
  }

  const people = await prisma.user.findMany({
    // `PERSON_WHERE` ya filtra activos y excluye al usuario del kiosko, que está
    // dado de alta como ASESOR y no es una persona — ver `lib/store-people`.
    where: { storeId: parsed.data.storeId, ...PERSON_WHERE },
    select: { id: true, name: true, employeeNumber: true }
  });
  const match = matchPosRows(converted.value, people);

  // Un nombre ambiguo detiene TODO: colgarle la venta del día a quien no es le
  // mueve el alcance y la comisión a dos personas a la vez.
  if (match.ambiguous.length > 0) {
    return NextResponse.json(
      {
        error: "Hay nombres que encajan con varias personas.",
        detail: match.ambiguous.map((item) => `«${item.name}» podría ser ${item.candidates.join(" o ")}.`)
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    date: read.value.from,
    storeNumber: read.value.storeNumber,
    // Quien no aparece en el reporte NO se toca: no vendió o no trabajó, y eso
    // es distinto de ponerle cero a mano.
    entries: match.matched.map((item) => ({
      employeeNumber: item.user.employeeNumber,
      name: item.user.name,
      posName: item.row.name,
      dailySales: item.row.dailySales,
      transactions: item.row.transactions,
      pieces: item.row.pieces,
      grossSales: item.row.grossSales,
      discountAmount: item.row.discountAmount
    })),
    unmatched: match.unmatched
  });
}
