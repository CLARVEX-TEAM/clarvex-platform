import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { captureInventoryMovements } from "@/lib/inventory-kardex";
import { resolveMonterreyDate } from "@/lib/cron-time";
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

  /*
   * ⚠️ **El tiempo viaja también en los RECHAZOS, y ahí es donde más falta
   * hace.** El caso más lento que existe es un modelo agotando sus 25 s, y ese
   * sale por un 422, no por el éxito. Dejar el cronómetro solo en la respuesta
   * buena deja ciego justo el camino del que alguien se va a quejar: la queja
   * llegaría otra vez sin un número que mirar, que es el problema que este
   * cambio vino a cerrar.
   */
  const ms = lectura.ms;

  if (!lectura.ok) {
    return NextResponse.json(
      { error: lectura.problema, detalle: lectura.detalle ?? [], ms },
      { status: 422, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const { hoja, confirmadaPorDos } = lectura;
  const problemas = problemasDeHoja(hoja, apto);
  if (problemas.length > 0) {
    return NextResponse.json({ error: "La hoja no se puede capturar.", detalle: problemas, ms }, { status: 422 });
  }

  const contraparte = contraparteDe(hoja);
  if (!contraparte) {
    return NextResponse.json({ error: "No se reconoció la otra ubicación del traspaso.", ms }, { status: 422 });
  }

  /*
   * ⚠️ **El traspaso se fecha HOY, no con la fecha de la hoja.**
   *
   * La que imprime el papel es la de IMPRESIÓN --arriba a la derecha, junto a la
   * hora-- y su campo «Fecha en que se despachó» viene EN BLANCO. Una hoja se
   * puede imprimir un día y despachar al siguiente, así que fecharla por el
   * papel mete el movimiento en un día en que la mercancía todavía estaba en la
   * tienda. La tienda lo captura cuando sale, y ese es el día que cuenta.
   *
   * ⚠️ **Y «hoy» es el de MONTERREY, no el del servidor.** La máquina corre en
   * UTC, seis horas por delante: a partir de las seis de la tarde allá, un
   * `new Date()` aquí ya dice mañana, y el traspaso caería en el día siguiente
   * --o en la semana siguiente, o al otro lado del corte de una ronda--.
   * `resolveMonterreyDate` es el mismo cálculo que usan los crons.
   */
  const fechaDelMovimiento = resolveMonterreyDate().dateKey;

  const guardado = await captureInventoryMovements(storeId, [
    {
      date: fechaDelMovimiento,
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
    return NextResponse.json(
      { error: "No se pudo guardar el traspaso.", detalle: guardado.errors, ms },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      folio: hoja.folio,
      piezas: hoja.piezas,
      fecha: fechaDelMovimiento,
      fechaImpresaEnLaHoja: hoja.fechaImpresa,
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
      comprobadaLaTienda: apto.length > 0,
      /*
       * Lo que tardo cada lectura.
       *
       * ⚠️ Va en la RESPUESTA y no solo al log: n8n conserva las ultimas
       * veintidos ejecuciones, asi que un «a veces tarda mucho» reportado al dia
       * siguiente ya no tiene nada que mirar. Puesto aqui, cada queja llega con
       * su numero. Referencia medida el 14 de septiembre de 2026 contra la hoja
       * real: el rapido ~1.6 s, el segundo ~3.1 s.
       */
      ms
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
