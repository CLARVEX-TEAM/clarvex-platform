import { PendingStatus } from "@prisma/client";
import { z } from "zod";
import { defineTool, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getOpenPendings } from "@/lib/services/pending-service";

const argsSchema = z.object({
  status: z.enum(["open", "in_progress", "all"]).optional()
});

const STATUS_MAP: Record<string, PendingStatus[]> = {
  open: [PendingStatus.PENDIENTE],
  in_progress: [PendingStatus.EN_PROCESO],
  all: [PendingStatus.PENDIENTE, PendingStatus.EN_PROCESO]
};

// Pendientes abiertos priorizados. Asesor ve solo los suyos; gerencia, los de
// toda la tienda.
export const getOpenPendingsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getOpenPendings",
  description: "Lista los pendientes/tareas abiertos priorizados (título, prioridad, categoría, responsable, fecha límite). Para asesor son solo los suyos; para gerencia, los de toda la tienda.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["open", "in_progress", "all"], description: "Filtro de estado. Por defecto 'all' (pendientes + en proceso)." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const statuses = STATUS_MAP[args.status ?? "all"];
    const pendings = await getOpenPendings(toSession(ctx), { statuses });
    return toolOk({ count: pendings.length, pendings });
  }
});
