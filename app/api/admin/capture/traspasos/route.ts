import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureInventoryMovements } from "@/lib/inventory-kardex";
import { prisma } from "@/lib/prisma";
import { contraparteDe, cuadraLaPagina, problemasDeHoja } from "@/lib/traspaso-hoja";
import { leerHojaTraspaso, traspasoConfigurado } from "@/lib/traspaso-vision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Captura un traspaso desde la FOTO de la hoja del corporativo.
 *
 * Es la misma escritura que la pantalla de Kardex --`captureInventoryMovements`,
 * las mismas reglas-- con otra puerta de entrada. No hay una segunda verdad: la
 * lógica del kardex vive en un solo sitio y aquí solo se lee el papel.
 *
 * ⚠️ **Esto mueve INVENTARIO y la hoja no trae con qué comprobarse.** Solo llega
 * la primera página y sus renglones no suman el total. Por eso se lee con dos
 * modelos distintos y se exige que coincidan --ver `lib/traspaso-vision`-- y por
 * eso una lectura que no cuadra NO se guarda: un total mal leído entra al kardex
 * y no se nota hasta el conteo físico, semanas después y sin rastro del día.
 */

const esquema = z.object({
  storeId: z.string().min(1).max(64),
  imagenBase64: z.string().min(100),
  mimeType: z.string().min(3).max(64),
  /** Quién mandó la foto, para que el movimiento no quede sin dueño. */
  createdBy: z.string().max(64).nullish(),
  /*
   * El APTO de la tienda («03029»), contra el que se comprueba que la hoja sea
   * suya: en una salida ella es la ubicación de ENVÍO.
   *
   * ⚠️ **Viene del llamante y NO de la base porque `Store` todavía no lo
   * guarda.** Lo correcto es una columna `apto` en `Store` --serviría también
   * para comprobar el «Nº de tienda» del reporte del POS-- y hasta entonces
   * esto es configuración de quien captura, con el mismo nivel de confianza que
   * el `storeId` que ya manda.
   *
   * Si no viene, la comprobación NO se hace y se dice en la respuesta: dejarlo
   * en silencio haría indistinguible «se comprobó» de «no se pudo».
   */
  apto: z.string().max(16).nullish()
});

export async function POST(request: Request) {
  const noAutorizado = requireAdminCapture(request);
  if (noAutorizado) return noAutorizado;

  if (!traspasoConfigurado()) {
    return NextResponse.json({ error: "La lectura de hojas no está configurada en el servidor." }, { status: 503 });
  }

  const cuerpo = await request.json().catch(() => null);
  const parsed = esquema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Faltan la tienda o la foto de la hoja." }, { status: 400 });
  }
  const { storeId, imagenBase64, mimeType, createdBy } = parsed.data;

  const tienda = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!tienda) return NextResponse.json({ error: "Esa tienda no existe." }, { status: 404 });

  /*
   * ⚠️ El APTO NUNCA se toma de la hoja: validarla contra sí misma no comprueba
   * nada. O viene de fuera, o la comprobación no se hace y se declara.
   */
  const apto = (parsed.data.apto ?? "").trim();

  const lectura = await leerHojaTraspaso(imagenBase64, mimeType);
  if (!lectura.ok) {
    return NextResponse.json(
      { error: lectura.problema, detalle: lectura.detalle ?? [] },
      { status: 422, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { hoja, confirmadaPorDos } = lectura;
  const problemas = problemasDeHoja(hoja, apto);
  if (problemas.length > 0) {
    return NextResponse.json({ error: "La hoja no se puede capturar.", detalle: problemas }, { status: 422 });
  }

  const contraparte = contraparteDe(hoja);
  if (!contraparte) {
    return NextResponse.json({ error: "No se reconoció la otra ubicación del traspaso." }, { status: 422 });
  }

  const guardado = await captureInventoryMovements(storeId, [
    {
      date: hoja.fecha,
      type: hoja.direccion === "SALIDA" ? "TRANSFERENCIA_SALIDA" : "TRANSFERENCIA_ENTRADA",
      // Siempre positiva: el sentido lo pone el tipo, nunca el signo.
      quantity: hoja.piezas,
      reference: hoja.folio,
      counterpart: contraparte.label,
      counterpartCode: contraparte.code,
      createdBy: createdBy ?? null
    }
  ]);

  if (!guardado.ok) {
    return NextResponse.json({ error: "No se pudo guardar el traspaso.", detalle: guardado.errors }, { status: 422 });
  }

  return NextResponse.json(
    {
      ok: true,
      folio: hoja.folio,
      piezas: hoja.piezas,
      fecha: hoja.fecha,
      direccion: hoja.direccion,
      contraparte: contraparte.label,
      /*
       * Cuánto se pudo comprobar, dicho en claro. No es adorno: cambia lo que
       * quien captura tiene que revisar, y callarlo dejaría las dos situaciones
       * indistinguibles desde fuera.
       */
      confirmadaPorDos,
      cuadraLaPagina: cuadraLaPagina(hoja),
      /** Falso cuando nadie mando el APTO y no se pudo comprobar la tienda. */
      comprobadaLaTienda: apto.length > 0
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
