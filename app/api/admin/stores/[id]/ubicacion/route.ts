import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requirePlatformAdmin } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { coordenadaUtil } from "@/lib/mapa-tienda";
import { MapaNoDisponible, armarMapaDeTienda } from "@/lib/mapa-tienda-imagen";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Ubicación de una tienda: dirección, coordenadas y el mapa ya armado.
 *
 * ⚠️ El mapa se genera AQUÍ, al guardar, y se sube a R2. No se arma al pintar
 * la pantalla: la ubicación de una tienda no cambia nunca, así que es un
 * archivo y no un servicio. Ver la cabecera de `lib/mapa-tienda.ts`.
 */
const ubicacionSchema = z.object({
  address: z.string().trim().max(240).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable()
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, ubicacionSchema);
  if ("response" in parsed) return parsed.response;

  const tienda = await prisma.store.findUnique({ select: { id: true, name: true, mapaUrl: true }, where: { id } });
  if (!tienda) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  /*
   * ⚠️ `coordenadaUtil` rechaza el `0, 0` y lo que se salga de Mercator. Es una
   * coordenada válida --cae en el golfo de Guinea-- y es exactamente lo que
   * queda al guardar el formulario vacío, así que sin esta guarda la tienda se
   * quedaría con un mapa del Atlántico que PARECE correcto.
   */
  const coordenada = coordenadaUtil(parsed.data.latitude, parsed.data.longitude);
  if ((parsed.data.latitude !== null || parsed.data.longitude !== null) && !coordenada) {
    return NextResponse.json(
      { error: "Esas coordenadas no son utilizables. Revisa que no sean 0,0 y que la latitud esté entre -85 y 85." },
      { status: 400 }
    );
  }

  let mapaUrl = tienda.mapaUrl;
  let avisoMapa: string | null = null;

  if (coordenada) {
    try {
      const imagen = await armarMapaDeTienda(coordenada);
      const nuevo = await uploadToR2(`mapas/${tienda.id}-${Date.now()}.jpg`, imagen, "image/jpeg");
      /*
       * ⚠️ El mapa viejo se borra DESPUÉS de subir el nuevo, no antes.
       *
       * Si OpenStreetMap falla a media operación, borrarlo primero dejaría a la
       * tienda sin mapa y sin forma de recuperarlo hasta reintentar. Así, lo
       * peor que pasa es que quede un archivo huérfano en R2.
       */
      if (tienda.mapaUrl && tienda.mapaUrl !== nuevo) {
        await deleteFromR2(tienda.mapaUrl).catch(() => undefined);
      }
      mapaUrl = nuevo;
    } catch (error) {
      /*
       * ⚠️ Que el mapa no se pueda armar NO tumba el guardado.
       *
       * La dirección y las coordenadas son el dato; el mapa es su dibujo. Si
       * OSM está caído o bloqueó la petición, se guarda lo que sí se sabe y se
       * DICE que el mapa no se pudo generar -- con el motivo, para que no se
       * busque el fallo donde no está. Volver a guardar lo reintenta.
       */
      avisoMapa = error instanceof MapaNoDisponible
        ? error.message
        : "No se pudo armar el mapa. Se guardó la ubicación; vuelve a guardar para reintentarlo.";
    }
  } else {
    // Sin coordenadas no hay mapa que enseñar: se retira el que hubiera.
    if (tienda.mapaUrl) await deleteFromR2(tienda.mapaUrl).catch(() => undefined);
    mapaUrl = null;
  }

  const actualizada = await prisma.store.update({
    where: { id },
    data: {
      address: parsed.data.address?.trim() || null,
      latitude: coordenada?.lat ?? null,
      longitude: coordenada?.lng ?? null,
      mapaUrl
    },
    select: { id: true, address: true, latitude: true, longitude: true, mapaUrl: true }
  });

  await recordAudit({
    session, action: "store.ubicacion.update", entity: "Store", entityId: tienda.id,
    storeId: tienda.id, storeName: tienda.name,
    // El registro dice QUÉ cambió, no repite las coordenadas: ya están en la
    // fila de la tienda y aquí solo serían ruido.
    detail: `Dirección: ${actualizada.address ? "sí" : "—"} · Mapa: ${actualizada.mapaUrl ? "generado" : "sin mapa"}${avisoMapa ? ` · ${avisoMapa}` : ""}`
  });

  return NextResponse.json({ store: actualizada, avisoMapa });
}
