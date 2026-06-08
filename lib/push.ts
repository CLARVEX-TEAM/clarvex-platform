import webpush from "web-push";
import { prisma } from "@/lib/prisma";

webpush.setVapidDetails(
  "mailto:admin@clarvex.local",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";

export type PushPayload = { title: string; body: string; icon?: string };

export async function dispatchPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } }
  });
  if (subscriptions.length === 0) return;

  const expiredIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, icon: payload.icon ?? "/icon.svg" })
        );
      } catch (error: unknown) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          expiredIds.push(sub.id);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }
}
