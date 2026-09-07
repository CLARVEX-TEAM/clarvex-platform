import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { enviarPorFcm } from "@/lib/push-fcm";

// Solo configurar VAPID cuando hay claves reales. En CI/tests (y en cualquier
// entorno sin VAPID) el import no debe tumbar el proceso: Phase 3 del Copilot
// importa announcement-service → push, y sin este guard el suite falla con
// "No key set vapidDetails.publicKey" al cargar el módulo.
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@adrianluna.mx",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export const VAPID_PUBLIC_KEY = vapidPublicKey;

export type PushPayload = { title: string; body: string; icon?: string; tag?: string; url?: string };

/**
 * Manda la notificación por los DOS caminos que existen hoy:
 *
 * | Camino | Quién lo recibe |
 * |---|---|
 * | Web Push (VAPID) | el navegador y la PWA instalada |
 * | FCM | la app de Android de la Play Store |
 *
 * ⚠️ **No son alternativas: son públicos distintos.** El WebView de Android no
 * implementa la API de Push, así que dentro de la app instalada el camino de
 * VAPID no puede ni pedir permiso; y un navegador de escritorio no tiene token
 * de FCM. Quien tenga las dos --la PWA en el teléfono y la app-- recibe dos
 * avisos; se prefiere eso a decidir por la persona cuál de sus aparatos calla.
 *
 * ⚠️ **Los dos caminos van por SEPARADO y ninguno puede tumbar al otro.** Antes
 * la falta de claves VAPID cortaba la función entera; con dos destinos eso
 * dejaría a la app sin notificaciones por un problema del navegador. Cada rama
 * comprueba lo suyo y se lanzan con `allSettled`.
 */
export async function dispatchPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    console.log(`[push mock] Dispatching notification to ${userIds.length} users: ${payload.title}`);
    return;
  }
  await Promise.allSettled([enviarWebPush(userIds, payload), enviarNativo(userIds, payload)]);
}

/**
 * FCM para la app de Android.
 *
 * ⚠️ El filtro de usuario activo es el MISMO que el de Web Push y por el mismo
 * motivo: una baja no puede seguir recibiendo avisos de la tienda porque el
 * llamante no filtró su lista. Duplicar la regla aquí es deliberado --son dos
 * consultas-- y por eso las dos dicen `user: { active: true }`.
 */
async function enviarNativo(userIds: string[], payload: PushPayload) {
  const aparatos = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds }, user: { active: true } },
    select: { token: true }
  });
  if (aparatos.length === 0) return;

  const { caducados } = await enviarPorFcm(
    aparatos.map((a) => a.token),
    { title: payload.title, body: payload.body, icon: payload.icon, tag: payload.tag, url: payload.url }
  );

  if (caducados.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { token: { in: caducados } } });
  }
}

async function enviarWebPush(userIds: string[], payload: PushPayload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] VAPID keys missing — skipping dispatch");
    return;
  }
  // Filtro central: un usuario desactivado no recibe push aunque el caller no
  // haya filtrado su lista (cubre goles, resúmenes, comunicados, etc.).
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, user: { active: true } }
  });
  if (subscriptions.length === 0) return;

  const expiredIds: string[] = [];
  const tag = payload.tag ?? "clarvex-notification";
  // topic agrupa/reemplaza notificaciones del mismo tipo; debe ser URL-safe y <= 32 chars.
  const topic = tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      let host = "";
      try { host = new URL(sub.endpoint).host; } catch { /* endpoint raro */ }
      // Apple (web.push.apple.com) rechaza nuestro header Topic con
      // "BadWebPushTopic" y NO entrega la notificación: a los iPhone no les
      // llegaba nada. El Topic solo colapsa notificaciones en cola (una
      // optimización), así que en iOS se OMITE para garantizar la entrega. El
      // `tag` del payload sigue agrupando las ya mostradas en el dispositivo.
      const isApple = host.endsWith("push.apple.com");
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon ?? "/icon-192.png",
            tag,
            url: payload.url ?? "/notificaciones"
          }),
          {
            urgency: "high",        // máxima prioridad: mejor oportunidad contra No Molestar en Android
            TTL: 86400,             // 24 h de vida si el dispositivo está offline
            ...(topic && !isApple ? { topic } : {})
          }
        );
      } catch (error: unknown) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          expiredIds.push(sub.id);
        } else {
          // Registrar el body del servicio de push: ahí viene el motivo real del
          // rechazo (VAPID inválido, JWT, payload, etc.), no solo el status.
          const body = (error as { body?: string }).body;
          console.error(
            "[push] Error enviando notificacion — status:", status,
            "host:", host,
            "body:", typeof body === "string" ? body.slice(0, 300) : body,
            "msg:", (error as Error).message
          );
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }
}
