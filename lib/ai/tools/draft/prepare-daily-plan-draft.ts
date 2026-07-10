import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getDailyPlanContext } from "@/lib/services/draft-service";

const argsSchema = z.object({
  userId: z.string().min(1)
});

// FASE 2 (borradores): reúne el desempeño, pendientes y horario de un asesor
// para que el modelo REDACTE un borrador de plan del día. No guarda nada.
export const prepareDailyPlanDraftTool = defineTool<z.infer<typeof argsSchema>>({
  name: "prepareDailyPlanDraft",
  description: "Reúne el contexto de un asesor (desempeño de la semana, pendientes y horario) para que redactes un BORRADOR de plan del día (enfoque, mensaje y actividades). No guarda nada; el usuario lo revisará y aplicará manualmente.",
  phase: 2,
  roles: ["GERENTE", "SUBGERENTE"],
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      userId: { type: "string", description: "ID del asesor para el que se redacta el plan." }
    },
    required: ["userId"],
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const context = await getDailyPlanContext(toSession(ctx), args.userId);
    if (!context) return toolError("El colaborador no pertenece a tu tienda o no tiene datos.");
    return toolOk({ ...context, isDraft: true });
  }
});
