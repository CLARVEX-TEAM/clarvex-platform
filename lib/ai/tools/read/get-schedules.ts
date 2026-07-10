import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { getSchedules } from "@/lib/services/schedule-service";
import { parseWeekStart } from "@/lib/schedule-week";

const argsSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userId: z.string().min(1).optional()
});

// Horarios/turnos de la semana. Asesor ve solo el suyo; gerencia, el del equipo
// o el de un colaborador de su tienda.
export const getSchedulesTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getSchedules",
  description: "Devuelve los horarios y turnos de la semana (día, entrada, salida, zona, estatus) por colaborador. Para asesor, solo su propio horario; para gerencia, el del equipo o el de un colaborador específico.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      weekStart: { type: "string", description: "Domingo de la semana en formato YYYY-MM-DD. Opcional; por defecto la semana actual." },
      userId: { type: "string", description: "ID de colaborador (solo gerencia). Opcional." }
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
    const result = await getSchedules(toSession(ctx), { weekStart, userId: args.userId });
    return toolOk(result);
  }
});
