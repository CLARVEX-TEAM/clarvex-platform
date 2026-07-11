import type { Prisma } from "@prisma/client";

export const RETAIL_ALERT_TYPES = {
  WEEK_GOAL_80: "WEEK_GOAL_80",
  WEEK_GOAL_100: "WEEK_GOAL_100",
  PENDING_OVERDUE_MGR: "PENDING_OVERDUE_MGR"
} as const;

export type RetailAlertType = (typeof RETAIL_ALERT_TYPES)[keyof typeof RETAIL_ALERT_TYPES];

export function weekGoalPeriodKey(weekNumber: number | null, startDate: string, endDate: string): string {
  return weekNumber !== null ? `week:${weekNumber}` : `week:${startDate}:${endDate}`;
}

type Tx = Prisma.TransactionClient;

export async function filterUsersWithoutAlert(
  tx: Tx,
  input: { storeId: string; userIds: string[]; periodKey: string; alertType: RetailAlertType }
): Promise<string[]> {
  if (input.userIds.length === 0) return [];
  const sent = await tx.retailAlertLog.findMany({
    where: {
      storeId: input.storeId,
      userId: { in: input.userIds },
      periodKey: input.periodKey,
      alertType: input.alertType
    },
    select: { userId: true }
  });
  const already = new Set(sent.map((row) => row.userId));
  return input.userIds.filter((id) => !already.has(id));
}

export async function recordRetailAlerts(
  tx: Tx,
  input: { storeId: string; userIds: string[]; periodKey: string; alertType: RetailAlertType }
): Promise<void> {
  if (input.userIds.length === 0) return;
  await tx.retailAlertLog.createMany({
    data: input.userIds.map((userId) => ({
      storeId: input.storeId,
      userId,
      periodKey: input.periodKey,
      alertType: input.alertType
    })),
    skipDuplicates: true
  });
}
