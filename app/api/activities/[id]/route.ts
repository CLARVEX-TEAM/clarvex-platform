import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { completed } = await request.json();

  const activity = await prisma.activity.update({
    where: { id: params.id },
    data: {
      completed: Boolean(completed),
      completedAt: completed ? new Date() : null
    }
  });

  return NextResponse.json({
    id: activity.id,
    title: activity.title,
    completed: activity.completed
  });
}
