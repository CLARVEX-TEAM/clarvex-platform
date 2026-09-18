import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { leerRespuesta, type Clima } from "@/lib/clima";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * El clima de la tienda, para la entrada de «Mi día».
 *
 * ⚠️ **Va por el servidor y no desde el teléfono a propósito.** Así se cachea
 * una sola vez para toda la tienda en vez de una petición por aparato y por
 * apertura, y el proveedor no ve las direcciones de la gente.
 *
 * ⚠️ **Nunca devuelve error.** Contesta `{ clima: null }` cuando no se pudo
 * saber, y quien llama se salta la entrada. Es decoración: no puede tumbar ni
 * retrasar la pantalla donde se consulta el turno y la venta del día.
 */

/*
 * ⚠️ Las coordenadas son de la tienda y hoy están FIJAS en Monterrey, porque
 * `Store` todavía no guarda latitud y longitud. El día que las guarde, salen de
 * ahí y esta constante sobra —el mismo caso que el APTO de los traspasos—. Con
 * una sola plaza no se nota; con dos ciudades, sí.
 */
const TIENDA = { lat: 25.65, lon: -100.36, nombre: "Monterrey" };

/** Cuánto vale una lectura antes de volver a preguntar. */
const VIGENCIA_MS = 15 * 60 * 1000;

/**
 * ⚠️ Tope de espera CORTO. Es un adorno: si el proveedor tarda, se prefiere
 * abrir sin clima a que la persona mire una pantalla en blanco. Sin este corte,
 * un servicio gratuito colgado se convierte en nuestra pantalla colgada.
 */
const TOPE_MS = 4000;

let cache: { clima: Clima | null; hasta: number } | null = null;

async function consultar(): Promise<Clima | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${TIENDA.lat}&longitude=${TIENDA.lon}` +
    "&current=temperature_2m,weather_code,is_day" +
    "&timezone=America%2FMonterrey";

  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), TOPE_MS);
  try {
    const respuesta = await fetch(url, { signal: corte.signal, cache: "no-store" });
    if (!respuesta.ok) {
      console.warn(`[clima] el proveedor respondió ${respuesta.status}`);
      return null;
    }
    return leerRespuesta(await respuesta.json());
  } catch (error) {
    // Se registra con su motivo: sin esta línea, "no hay clima" y "nunca se
    // preguntó" se ven igual desde fuera.
    console.warn(`[clima] no se pudo consultar: ${(error as Error).message}`);
    return null;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const ahora = Date.now();
  if (!cache || cache.hasta <= ahora) {
    const clima = await consultar();
    /*
     * ⚠️ El fallo TAMBIÉN se cachea, y más corto. Sin eso, un proveedor caído
     * se traduce en una petición de cuatro segundos por cada apertura de la
     * app; con esto, una cada tres minutos y las demás salen al instante.
     */
    cache = { clima, hasta: ahora + (clima ? VIGENCIA_MS : 3 * 60 * 1000) };
  }

  return NextResponse.json(
    { clima: cache.clima, ciudad: TIENDA.nombre },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
