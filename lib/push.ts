import webpush from "web-push";
import { prisma } from "@/lib/prisma";

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

export async function dispatchPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    console.log(`[push mock] Dispatching notification to ${userIds.length} users: ${payload.title}`);
    return;
  }
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
