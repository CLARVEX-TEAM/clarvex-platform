import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { prisma } from "@/lib/prisma";
import { faltaAlgo, redactarComunicado } from "@/lib/promo-comunicado";
import { leerPromocion } from "@/lib/promo-vision";

export const dynamic = "force-dynamic";

/**
 * Recibe la captura del correo de promociones y deja el comunicado REDACTADO
 * esperando en Clarvex.
 *
 * ⚠️ **No publica nada.** Escribe un borrador que la gerencia tiene que abrir,
 * revisar y publicar. Es la misma separación que el reconocimiento de zonas del
 * reporte visual: proponer y aplicar van aparte, porque un correo mal leído
 * aquí se convierte en un precio equivocado en el mostrador.
 *
 * ⚠️ Y **el correo del corporativo llega a más de veinte tiendas**: el `storeId`
 * decide de quién es esta promoción. Va en el cuerpo y se comprueba que exista;
 * un borrador en la tienda equivocada le enseñaría a un equipo condiciones que
 * no son suyas.
 */

const esquema = z.object({
  storeId: z.string().min(1),
  // La captura, en base64. Mismo camino que el lector del reporte del POS.
  imagenBase64: z.string().min(100),
  mimeType: z.string().min(3).max(64)
});

export async function POST(request: Request) {
  const noAutorizado = requireAdminCapture(request);
  if (noAutorizado) return noAutorizado;

  const cuerpo = await request.json().catch(() => null);
  const parsed = esquema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Faltan la tienda o la captura." }, { status: 400 });
  }
  const { storeId, imagenBase64, mimeType } = parsed.data;

  const tienda = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!tienda) return NextResponse.json({ error: "Esa tienda no existe." }, { status: 404 });

  const lectura = await leerPromocion(imagenBase64, mimeType);
  if (!lectura.ok) {
    return NextResponse.json(
      { error: `No se pudo leer la promoción: ${lectura.problema}. Manda la captura otra vez, o más completa.` },
      { status: 422 }
    );
  }

  /*
   * ⚠️ **Una lectura incompleta NO se guarda.** Un borrador sin vigencia se lee
   * como una promoción indefinida, y sin descuentos no dice nada: las dos cosas
   * parecen un comunicado terminado. Es preferible mandar a mirar el correo.
   */
  const faltas = faltaAlgo(lectura.promo);
  if (faltas.length > 0) {
    return NextResponse.json(
      { error: `La captura no deja ver ${faltas.join(", ")}. Manda una que incluya el correo completo.` },
      { status: 422 }
    );
  }

  const { title, body } = redactarComunicado(lectura.promo);
  const borrador = await prisma.promoDraft.create({
    data: { storeId, title, body, datos: lectura.promo },
    select: { id: true }
  });

  return NextResponse.json({ ok: true, id: borrador.id, title, body }, { status: 201 });
}
