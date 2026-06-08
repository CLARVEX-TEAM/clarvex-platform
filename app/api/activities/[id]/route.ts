  const updated = await prisma.$transaction(async (tx: any) => {
    const result = await tx.dayPlanTask.update({
      where: { id: activity.id },
      data: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    if (parsed.data.completed && activity.evidences.length > 0) {
      const managers = await tx.user.findMany({
        where: {
          storeId: session.storeId,
          role: { in: ["GERENTE", "SUBGERENTE"] },
          id: { not: session.userId },
        },
        select: { id: true },
      });

      const recipients = new Set<string>(managers.map((manager: { id: string }) => manager.id));

      if (activity.plan.userId !== session.userId) {
        recipients.add(activity.plan.userId);
      }

      await createNotifications(
        tx,
        Array.from(recipients).map((userId: string) => ({
          storeId: session.storeId,
          userId,
          type: "TASK_COMPLETED" as const,
          title: "Actividad completada con evidencia",
          body: activity.title,
        })),
      );
    }

    return result;
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    completed: updated.completed,
  });
}
