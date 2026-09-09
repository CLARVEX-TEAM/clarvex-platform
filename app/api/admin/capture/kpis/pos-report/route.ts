import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { avisoDeAusentes, quienFaltaEnElReporte } from "@/lib/pos-ausentes";
import { matchPosRows, posCaptureRows } from "@/lib/pos-productivity";
import { isVisionConfigured, readPosReport } from "@/lib/pos-vision";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";
import { decodePosDocument, posFailureStore } from "@/lib/pos-failure-store";
import type { PosVisionTrace } from "@/lib/pos-vision-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lee el reporte diario «Productividad del vendedor» del POS y devuelve las
 * filas listas para revisar: venta, tickets, piezas, bruto y descuento por
 * asesor.
 *
 * No guarda KPIs. Los rechazos conservan un diagnóstico privado temporal.
 * El guardado de ventas sigue siendo el de siempre
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
  try { decodePosDocument(document); }
  catch { return NextResponse.json({ error: "El archivo no tiene una codificación válida." }, { status: 400 }); }
  const trace: PosVisionTrace = { attempts: [] };
  const reject = async (stage: "vision" | "validation" | "matching", error: string, detail: string[]) => {
    let diagnosticId: string | null = null;
    try {
      diagnosticId = await posFailureStore().save({
        storeId: store.id, mimeType: parsed.data.mimeType, documentBase64: document,
        stage, error: [error, ...detail].join("\n"), attempts: trace.attempts
      });
    } catch {
      // No imprimir el original, nombres, importes, salida de IA ni errores del SDK.
      console.warn("[pos-history] No se pudo conservar el diagnóstico de una lectura rechazada.");
    }
    return NextResponse.json({
      error, detail: [...detail, diagnosticId
        ? `Diagnóstico privado guardado. Folio: ${diagnosticId}.`
        : "No se pudo guardar el diagnóstico. Conserva el archivo original para revisión."],
      diagnosticId, diagnosticSaved: diagnosticId !== null
    }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  };
  const read = await readPosReport(document, parsed.data.mimeType, trace);
  if (!read.ok) {
    return reject("vision", "No se pudo leer el reporte.", [read.error]);
  }

  const converted = posCaptureRows(read.value);
  if (!converted.ok) {
    return reject("validation", "La lectura no cuadra.", converted.error.split("\n"));
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
    return reject("matching", "Hay nombres que encajan con varias personas.",
      match.ambiguous.map((item) => `«${item.name}» podría ser ${item.candidates.join(" o ")}.`));
  }

  /*
   * ⚠️ **La única red contra una fila que el lector NUNCA VIO.**
   *
   * Las cuatro cuentas de `posCaptureRows` viven dentro de cada fila, así que
   * una fila entera perdida las pasa todas: las que quedan cuadran solas.
   * `unmatched` tampoco la ve — habla de nombres leídos que no se pudieron
   * emparejar, y aquí no hay nombre que reportar.
   *
   * El horario es la segunda opinión: lo captura otra persona por otra vía, así
   * que no es la misma lectura mirándose al espejo. Se compara contra la fecha
   * DEL REPORTE, no contra la que se esté capturando en pantalla.
   *
   * Avisa y no detiene: se puede trabajar y no vender. Ver `lib/pos-ausentes`.
   */
  const diaDelReporte = new Date(`${read.value.from}T00:00:00.000Z`);
  const horario = Number.isNaN(diaDelReporte.getTime())
    ? []
    : await prisma.schedule.findMany({
        where: { storeId: parsed.data.storeId, date: diaDelReporte, user: PERSON_WHERE },
        select: { userId: true, status: true, user: { select: { name: true } } }
      });
  const scheduledMissing = quienFaltaEnElReporte(
    horario.map((fila) => ({ userId: fila.userId, name: fila.user.name, status: fila.status })),
    match.matched.map((item) => item.user.id)
  );

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
    unmatched: match.unmatched,
    scheduledMissing,
    scheduledMissingNotice: avisoDeAusentes(scheduledMissing)
  });
}
