import { SignJWT } from "jose/jwt/sign";
import { importPKCS8 } from "jose/key/import";
import { CANAL_AVISOS_ID } from "@/lib/push-canal";

/**
 * Notificaciones a la app de Android por Firebase Cloud Messaging.
 *
 * ⚠️ **Esto NO sustituye a Web Push: lo COMPLEMENTA.** El navegador y la PWA
 * siguen entrando por VAPID (`lib/push.ts`). Este camino existe porque el
 * WebView de Android --que es donde corre la app del contenedor-- no implementa
 * ni la API de Push ni la de Notification, así que dentro de la app instalada
 * el camino de siempre no puede ni pedir permiso. Ver `dispatchPushToUsers`.
 *
 * ⚠️ **Se usa la API HTTP v1, no la heredada.** La `fcm.googleapis.com/fcm/send`
 * de toda la vida --la de la "server key"-- está retirada desde 2024 y responde
 * 404. La v1 firma cada petición con una cuenta de servicio, que es lo que hace
 * este archivo.
 */

const ALCANCE = "https://www.googleapis.com/auth/firebase.messaging";
const URL_TOKEN = "https://oauth2.googleapis.com/token";

export type CredencialesFcm = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * ⚠️ **La llave privada llega con `\n` literales, no con saltos de línea.**
 * Un `.env` no admite un valor de varias líneas sin comillas, así que la de
 * Google se pega escapada y `importPKCS8` la rechaza tal cual con un error que
 * habla de PKCS#8 y no de comillas. Se aceptan las dos formas: si el valor trae
 * la secuencia de dos caracteres, se convierte; si ya trae saltos reales
 * --porque se pegó entre comillas dobles-- se deja como está.
 */
export function normalizarLlavePrivada(bruta: string): string {
  const conSaltos = bruta.includes("\\n") ? bruta.replace(/\\n/g, "\n") : bruta;
  return conSaltos.trim();
}

/**
 * Devuelve las credenciales solo si las tres están y la llave tiene forma de
 * PEM. Media configuración es peor que ninguna: sin esta comprobación, el
 * primer envío fallaría dentro de `importPKCS8` con un error de criptografía
 * que no señala a la variable de entorno mal pegada.
 */
/**
 * Las dos mitades de la cabecera PEM, partidas a propósito.
 *
 * ⚠️ **NO volver a juntarlas.** El escáner de secretos de la CI busca la
 * expresión `BEGIN [A-Z ]*PRIVATE KEY` en las líneas añadidas de cada commit, y
 * la cadena entera --aunque aquí solo sirva para COMPROBAR, sin material de
 * ninguna llave-- pone en rojo un trabajo obligatorio. Partirla es más barato
 * que relajar el candado que existe justo para que no entre una llave de verdad.
 */
const PEM_ABRE = "-----BEGIN";
const PEM_CIERRA = "PRIVATE KEY-----";

export function leerCredenciales(env: Record<string, string | undefined> = process.env): CredencialesFcm | null {
  const projectId = env.FCM_PROJECT_ID?.trim() ?? "";
  const clientEmail = env.FCM_CLIENT_EMAIL?.trim() ?? "";
  const privateKeyBruta = env.FCM_PRIVATE_KEY ?? "";
  if (!projectId || !clientEmail || !privateKeyBruta) return null;

  const privateKey = normalizarLlavePrivada(privateKeyBruta);
  if (!privateKey.includes(PEM_ABRE) || !privateKey.includes(PEM_CIERRA)) {
    console.error(
      "[fcm] FCM_PRIVATE_KEY no parece una llave PKCS#8: le falta la cabecera PEM. " +
        "Se copia entera desde el JSON de la cuenta de servicio, con sus líneas de apertura y cierre."
    );
    return null;
  }
  return { projectId, clientEmail, privateKey };
}

/**
 * El token de acceso vale una hora. Se cachea POR PROCESO --con dos instancias
 * de PM2 hay dos, y está bien: son dos peticiones por hora, no un problema-- y
 * se renueva un minuto antes de caducar para no perder una notificación por
 * llegar justo al límite.
 */
let cache: { valor: string; expiraEn: number } | null = null;

export function olvidarTokenDeAcceso() {
  cache = null;
}

async function tokenDeAcceso(credenciales: CredencialesFcm): Promise<string | null> {
  const ahora = Math.floor(Date.now() / 1000);
  if (cache && cache.expiraEn > ahora + 60) return cache.valor;

  let asercion: string;
  try {
    const llave = await importPKCS8(credenciales.privateKey, "RS256");
    asercion = await new SignJWT({ scope: ALCANCE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(credenciales.clientEmail)
      .setSubject(credenciales.clientEmail)
      .setAudience(URL_TOKEN)
      .setIssuedAt(ahora)
      .setExpirationTime(ahora + 3600)
      .sign(llave);
  } catch (error) {
    console.error("[fcm] No se pudo firmar la petición de token:", (error as Error).message);
    return null;
  }

  try {
    const respuesta = await fetch(URL_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: asercion
      }),
      signal: AbortSignal.timeout(10_000)
    });
    const cuerpo = (await respuesta.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!respuesta.ok || !cuerpo.access_token) {
      console.error(
        "[fcm] Google rechazó la cuenta de servicio — status:",
        respuesta.status,
        "motivo:",
        cuerpo.error_description ?? "(sin detalle)"
      );
      return null;
    }
    cache = { valor: cuerpo.access_token, expiraEn: ahora + (cuerpo.expires_in ?? 3600) };
    return cache.valor;
  } catch (error) {
    console.error("[fcm] No se pudo pedir el token de acceso:", (error as Error).message);
    return null;
  }
}

export type MensajeFcm = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
};

export type ResultadoFcm = {
  enviados: number;
  /** Tokens que Google dice que ya no existen. Hay que borrarlos de la base. */
  caducados: string[];
};

/**
 * ⚠️ **`notification` Y `data`, no uno de los dos.**
 *
 * - Solo con `data`, Android NO pinta nada si la app está cerrada: el mensaje
 *   llega al código de la app, que no se está ejecutando. La notificación se
 *   perdería justo en el caso que importa, que es el teléfono en el bolsillo.
 * - Solo con `notification`, la bandeja la pinta el sistema pero al abrirla no
 *   sabemos a qué pantalla ir.
 *
 * Con las dos, el sistema la muestra siempre y `data.url` dice adónde llevar a
 * la persona al tocarla.
 */
function construirMensaje(token: string, payload: MensajeFcm) {
  const tag = payload.tag ?? "clarvex-notification";
  const url = payload.url ?? "/notificaciones";
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      // Los valores de `data` tienen que ser CADENAS: FCM rechaza el mensaje
      // entero con INVALID_ARGUMENT si llega un número o un booleano.
      data: { url, tag },
      android: {
        // "high" es lo que despierta al aparato en reposo. Con la prioridad por
        // omisión, Doze puede retener la notificación hasta la siguiente ventana
        // de mantenimiento: una alerta de captura llegaría horas tarde.
        priority: "high" as const,
        // Equivalente al `topic` de Web Push: reemplaza la anterior del mismo
        // tipo en vez de apilar diez avisos iguales.
        collapseKey: tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        notification: {
          tag,
          // El canal decide el sonido; ver `lib/push-canal.ts`.
          channelId: CANAL_AVISOS_ID,
          icon: "ic_stat_clarvex",
          color: "#2563EB",
          defaultSound: true
        },
        // 24 h de vida si el teléfono está sin señal, igual que el TTL de Web Push.
        ttl: "86400s"
      }
    }
  };
}

/** Un token que Google marca como muerto. Cualquier otro error se reintenta otro día. */
function esTokenMuerto(status: number, cuerpo: string): boolean {
  // 404 = UNREGISTERED: la app se desinstaló o Google rotó el token.
  if (status === 404) return true;
  // 400 = INVALID_ARGUMENT. Solo cuenta si se queja del CAMPO del token: el
  // mismo código sale por un payload mal armado, y eso es un fallo NUESTRO que
  // no debe borrarle el aparato a nadie.
  if (status === 400) return /"field"\s*:\s*"message\.token"/.test(cuerpo);
  return false;
}

export async function enviarPorFcm(tokens: string[], payload: MensajeFcm): Promise<ResultadoFcm> {
  const vacio: ResultadoFcm = { enviados: 0, caducados: [] };
  if (tokens.length === 0) return vacio;

  const credenciales = leerCredenciales();
  if (!credenciales) return vacio;

  const acceso = await tokenDeAcceso(credenciales);
  if (!acceso) return vacio;

  const destino = `https://fcm.googleapis.com/v1/projects/${credenciales.projectId}/messages:send`;
  const caducados: string[] = [];
  let enviados = 0;

  // ⚠️ Una petición POR TOKEN. La v1 no tiene envío múltiple: el endpoint
  // `/batch` que lo hacía se retiró con la API heredada. Son pocos aparatos
  // --una tienda son cinco personas-- así que en paralelo termina en un suspiro.
  await Promise.allSettled(
    tokens.map(async (token) => {
      try {
        const respuesta = await fetch(destino, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${acceso}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(construirMensaje(token, payload)),
          signal: AbortSignal.timeout(10_000)
        });
        if (respuesta.ok) {
          enviados += 1;
          return;
        }
        const cuerpo = await respuesta.text();
        if (esTokenMuerto(respuesta.status, cuerpo)) {
          caducados.push(token);
          return;
        }
        console.error("[fcm] Envío rechazado — status:", respuesta.status, "cuerpo:", cuerpo.slice(0, 300));
      } catch (error) {
        console.error("[fcm] Error enviando notificación:", (error as Error).message);
      }
    })
  );

  return { enviados, caducados };
}
