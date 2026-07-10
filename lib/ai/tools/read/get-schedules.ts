import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { resolveStoreTeammate } from "@/lib/ai/tools/resolve-teammate";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getSchedules } from "@/lib/services/schedule-service";
import { parseWeekStart } from "@/lib/schedule-week";

const argsSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  advisor: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

// Horarios/turnos de la semana. Asesor ve solo el suyo; gerencia, el del equipo
// o el de un colaborador de su tienda.
export const getSchedulesTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getSchedules",
  description:
    "Devuelve los horarios y turnos de la semana (día, entrada, salida, zona, estatus) por colaborador. Para un colaborador concreto pasa NOMBRE o número de empleado en `advisor`. NUNCA pidas UUID.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      weekStart: { type: "string", description: "Domingo de la semana en formato YYYY-MM-DD. Opcional; por defecto la semana actual." },
      advisor: {
        type: "string",
        description: "Nombre o número de empleado del colaborador. Ej: 'Alonso'. No uses UUID."
      }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    let weekStart: Date | undefined;
    if (args.weekStart) {
      const parsed = parseWeekStart(args.weekStart);
      if (!parsed) return toolError("weekStart debe ser un domingo en formato YYYY-MM-DD.");
      weekStart = parsed;
    }

    let userId = args.userId;
    const query = args.advisor?.trim();
    if (query && ctx.role !== "ASESOR") {
      const resolved = await resolveStoreTeammate(ctx.storeId, query);
      if (resolved.status === "not_found") return toolError(resolved.error);
      if (resolved.status === "ambiguous") {
        return toolOk({
          scope: "ambiguous",
          message: "Hay varios colaboradores que coinciden. Pregunta al usuario cuál (solo con el nombre).",
          candidates: resolved.candidates
        });
      }
      userId = resolved.user.id;
    }

    const result = await getSchedules(toSession(ctx), { weekStart, userId });
    return toolOk(result);
  }
});
