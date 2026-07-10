import webpush from "web-push";
import { prisma } from "@/lib/prisma";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? "mailto:admin@adrianluna.mx",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";

export type PushPayload = { title: string; body: string; icon?: string; tag?: string; url?: string };

export async function dispatchPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
    console.log(`[push mock] Dispatching notification to ${userIds.length} users: ${payload.title}`);
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
            ...(topic ? { topic } : {})
          }
        );
      } catch (error: unknown) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          expiredIds.push(sub.id);
        } else {
          console.error("[push] Error enviando notificacion — status:", status, (error as Error).message);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }
}
