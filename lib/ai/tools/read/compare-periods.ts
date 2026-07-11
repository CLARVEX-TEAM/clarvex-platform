import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { parsePeriodDate } from "@/lib/kpi-period";
import { comparePeriods } from "@/lib/services/comparison-service";

const argsSchema = z.object({
  period: z.enum(["week", "month"]).optional(),
  currentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  previousDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// Compara dos periodos (semana vs semana o mes vs mes) y devuelve variaciones.
// El scope depende del rol: tienda para gerencia, propio para asesor.
export const comparePeriodsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "comparePeriods",
  description: "Compara dos periodos RETAIL RDV (semana vs semana o mes retail vs mes retail anterior). Por defecto compara el periodo actual contra el RETAIL inmediatamente anterior (no 7/30 días naturales). Devuelve ventas, metas y alcance ya calculados — no calcules variaciones por tu cuenta.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["week", "month"], description: "Tipo de periodo. Por defecto 'week'." },
      currentDate: { type: "string", description: "Fecha del periodo actual (YYYY-MM-DD). Opcional; por defecto hoy." },
      previousDate: { type: "string", description: "Fecha dentro del periodo anterior (YYYY-MM-DD). Opcional; por defecto la semana/mes RETAIL previo." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const period = args.period ?? "week";
    const currentDate = args.currentDate ? parsePeriodDate(args.currentDate) : parsePeriodDate(null, ctx.now);
    if (!currentDate) return toolError("currentDate debe usar formato YYYY-MM-DD.");

    // Si no se indica previousDate, el servicio resuelve el periodo RETAIL
    // anterior desde el calendario RDV (no días de calendario).
    let previousDate: Date | undefined;
    if (args.previousDate) {
      const parsed = parsePeriodDate(args.previousDate);
      if (!parsed) return toolError("previousDate debe usar formato YYYY-MM-DD.");
      previousDate = parsed;
    }

    const result = await comparePeriods(toSession(ctx), { period, currentDate, previousDate });
    return toolOk(result);
  }
});
