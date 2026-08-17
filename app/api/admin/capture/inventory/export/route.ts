import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { exportKardex } from "@/lib/kardex-export";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Descarga el kardex de una ronda en el formato XLSX que la tienda ya entrega.
 *
 * Sin `roundId` se exporta la ronda abierta. Los avisos (ajustes presentes,
 * ronda sin cerrar) viajan en la cabecera `X-Kardex-Warnings` para que el panel
 * externo pueda mostrarlos sin tener que abrir el archivo.
 */
export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId")?.trim();
  if (!storeId) return NextResponse.json({ error: "Falta storeId." }, { status: 400 });

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const result = await exportKardex(storeId, {
    roundId: params.get("roundId")?.trim() || undefined,
    // APTO de la tienda en el catálogo de corporativo (03029 = San Agustín).
    // Va por parámetro porque Clarvex todavía no lo guarda como dato de tienda.
    apto: params.get("apto")?.trim() || undefined
  });
  if (!result) {
    return NextResponse.json(
      { error: "Esta tienda no tiene ninguna ronda de inventario que exportar." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // El nombre lleva acentos y espacios: se manda en RFC 5987 para que no se
      // rompa, con un ASCII de respaldo para clientes viejos.
      "Content-Disposition": `attachment; filename="kardex.xlsx"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      "Cache-Control": "no-store",
      ...(result.warnings.length > 0 ? { "X-Kardex-Warnings": encodeURIComponent(result.warnings.join(" | ")) } : {})
    }
  });
}
