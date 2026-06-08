import type { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/session-token";

type PrismaClient = typeof prisma;

type NotificationType = string;
type NotificationClient = Pick<PrismaClient, "notification">;

export type NotificationInput = {
  storeId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
};

export function createNotifications(client: NotificationClient, notifications: NotificationInput[]) {
  if (notifications.length === 0) return Promise.resolve({ count: 0 });
  return client.notification.createMany({ data: notifications as any });
}

export function serializeNotification(notification: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString()
  };
}

export function notificationScope(session: Pick<Session, "userId" | "storeId">) {
  return { userId: session.userId, storeId: session.storeId };
}
