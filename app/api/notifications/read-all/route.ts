import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { notificationScope } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const result = await prisma.notification.updateMany({
    where: { ...notificationScope(session), readAt: null },
    data: { readAt: new Date() }
  });
  return NextResponse.json({ updated: result.count });
}
