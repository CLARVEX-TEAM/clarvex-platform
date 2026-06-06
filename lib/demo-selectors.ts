export { announcements, completion, kpis, money, plans, schedules } from "@/lib/demo-data";
import { users } from "@/lib/demo-data";

export function getAdvisorFallback() {
  return users.find((user) => user.role === "ASESOR") ?? null;
}
