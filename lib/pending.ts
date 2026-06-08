import { PendingCategory, PendingPriority, PendingStatus } from "@prisma/client";
import { z } from "zod";

export const pendingInput = z.object({
  title: z.string().trim().min(3, "El titulo debe tener al menos 3 caracteres.").max(120),
  description: z.string().trim().min(3).max(2000),
  category: z.nativeEnum(PendingCategory),
  priority: z.nativeEnum(PendingPriority),
  status: z.nativeEnum(PendingStatus).optional(),
  ownerId: z.string().min(1),
  dueDate: z.string().date("La fecha limite no es valida.")
});

export function serializePending(item: { id: string; title: string; description: string; category: PendingCategory; priority: PendingPriority; ownerId: string; status: PendingStatus; dueDate: Date }) {
  return { id: item.id, title: item.title, description: item.description, category: item.category.toLowerCase(), priority: item.priority.toLowerCase(), ownerId: item.ownerId, status: item.status.toLowerCase().replace("_", " "), dueDate: item.dueDate.toISOString().slice(0, 10) };
}
