import { z } from "zod";
import { defineTool, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getPendingDraftContext } from "@/lib/services/draft-service";

const argsSchema = z.object({
  topic: z.string().trim().min(3).max(500)
});

// FASE 2 (borradores): entrega catálogos válidos (categorías/prioridades) y los
// pendientes actuales para que el modelo REDACTE un borrador de pendiente bien
// estructurado. No lo crea: el usuario lo registrará desde Pendientes.
export const preparePendingDraftTool = defineTool<z.infer<typeof argsSchema>>({
  name: "preparePendingDraft",
  description: "Reúne las categorías y prioridades válidas y los pendientes actuales (para evitar duplicados) y así redactar un BORRADOR de pendiente/tarea (título, descripción, categoría y prioridad sugeridas) sobre el tema indicado. No crea nada; el usuario lo registrará manualmente.",
  phase: 2,
  roles: ["GERENTE", "SUBGERENTE"],
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Tema o intención del pendiente a redactar." }
    },
    required: ["topic"],
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const context = await getPendingDraftContext(toSession(ctx), args.topic);
    return toolOk({ ...context, isDraft: true });
  }
});
