import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { extractTextItems, parseManifest } from "@/lib/manifest-pdf";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lee el manifiesto de carga en PDF y devuelve las cajas listas para revisar.
 *
 * **No escribe NADA.** Es a propósito: quien recibe la mercancía tiene que ver
 * lo que se leyó, poner la fecha del registro y anotar sobrantes o faltantes
 * antes de que entre al kardex. El guardado sigue siendo el de siempre
 * (`POST /api/admin/capture/inventory`), que ya valida la ronda abierta.
 *
 * La lectura se verifica sola contra el `Num.Cajas` y el `Cant.Total` que el
 * propio manifiesto declara — ver `lib/manifest-pdf`.
 */
const bodySchema = z.object({
  storeId: z.string().min(1).max(64),
  // El manifiesto ronda los 30 KB; el techo deja margen de sobra sin aceptar
  // que alguien suba un catálogo entero por error.
  pdfBase64: z.string().min(1).max(8_000_000)
});

/** Palabras del nombre que sirven para reconocer la tienda («TH», «DE»… no). */
function tokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word.length > 2);
}

export async function POST(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

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

  const store = await prisma.store.findUnique({ where: { id: parsed.data.storeId }, select: { id: true, name: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  let pdf: Buffer;
  try {
    pdf = Buffer.from(parsed.data.pdfBase64.replace(/^data:.*?;base64,/, ""), "base64");
  } catch {
    return NextResponse.json({ error: "El archivo no se pudo leer." }, { status: 400 });
  }
  if (pdf.subarray(0, 4).toString("latin1") !== "%PDF") {
    return NextResponse.json({ error: "El archivo no es un PDF." }, { status: 400 });
  }

  const outcome = parseManifest(extractTextItems(pdf));
  if (!outcome.ok) {
    return NextResponse.json({ error: "No se pudo leer el manifiesto.", detail: [outcome.error] }, { status: 422 });
  }
  const manifest = outcome.value;

  // Aviso, no bloqueo: cada tienda recibe su propio PDF, así que un destinatario
  // que no se parece al nombre de la tienda suele ser el archivo equivocado.
  // Bloquear sería peor: los nombres no coinciden literalmente («M003 TH
  // MONTERREY SAN AGUSTIN» contra «TH SAN AGUSTIN») y hay tiendas por abrir.
  const storeWords = tokens(store.name);
  const looksLikeStore =
    manifest.destination === null ||
    storeWords.length === 0 ||
    storeWords.some((word) => tokens(manifest.destination ?? "").includes(word));

  return NextResponse.json({
    ok: true,
    manifest: {
      manifest: manifest.manifest,
      transportSap: manifest.transportSap,
      destination: manifest.destination,
      commercialOrder: manifest.commercialOrder,
      checkOut: manifest.checkOut,
      boxes: manifest.declaredBoxes,
      pieces: manifest.declaredPieces
    },
    warnings: looksLikeStore
      ? []
      : [`El manifiesto va dirigido a «${manifest.destination}», que no parece ${store.name}. Revisa que sea el PDF de tu tienda.`],
    // Listas para revisar y guardar con POST /api/admin/capture/inventory. La
    // fecha NO viaja: la pone quien registra la entrada, que es la que vale
    // para el kardex, no la de salida del CEDIS.
    entries: manifest.boxes.map((box) => ({
      type: "RECEPCION",
      quantity: box.pieces,
      reference: box.box,
      delivery: box.delivery,
      document: manifest.manifest,
      surplus: 0,
      missing: 0
    }))
  });
}
