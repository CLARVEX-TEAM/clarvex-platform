import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { resolveStoreTeammate } from "@/lib/ai/tools/resolve-teammate";
import { isStoreManager, managerOnlyAdvisorQueryError } from "@/lib/ai/tools/role-guards";
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
    "Devuelve los horarios y turnos de la semana. El argumento `advisor` SOLO lo usa gerencia. Un asesor siempre recibe solo su propio horario.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      weekStart: { type: "string", description: "Domingo de la semana en formato YYYY-MM-DD. Opcional; por defecto la semana actual." },
      advisor: {
        type: "string",
        description: "SOLO gerencia. Nombre o número de empleado. Los asesores no deben enviar este campo."
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

    if (ctx.role === "ASESOR") {
      if (args.advisor || args.userId) {
        return toolError(managerOnlyAdvisorQueryError());
      }
      const result = await getSchedules(toSession(ctx), { weekStart });
      return toolOk(result);
    }

    if (!isStoreManager(ctx.role) && (args.advisor || args.userId)) {
      return toolError(managerOnlyAdvisorQueryError());
    }

    let userId = args.userId;
    const query = args.advisor?.trim();
    if (query) {
      if (!isStoreManager(ctx.role)) {
        return toolError(managerOnlyAdvisorQueryError());
      }
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
