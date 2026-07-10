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

const DAY_MS = 24 * 60 * 60 * 1000;

// Compara dos periodos (semana vs semana o mes vs mes) y devuelve variaciones.
// El scope depende del rol: tienda para gerencia, propio para asesor.
export const comparePeriodsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "comparePeriods",
  description: "Compara el desempeño entre dos periodos retail (por defecto el actual vs el anterior) y devuelve las variaciones de ventas, meta y alcance. Úsala para 'compara esta semana con la pasada' o tendencias.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["week", "month"], description: "Tipo de periodo. Por defecto 'week'." },
      currentDate: { type: "string", description: "Fecha del periodo actual (YYYY-MM-DD). Opcional; por defecto hoy." },
      previousDate: { type: "string", description: "Fecha del periodo anterior (YYYY-MM-DD). Opcional; por defecto una semana/mes antes." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const period = args.period ?? "week";
    const currentDate = args.currentDate ? parsePeriodDate(args.currentDate) : parsePeriodDate(null, ctx.now);
    if (!currentDate) return toolError("currentDate debe usar formato YYYY-MM-DD.");

    let previousDate: Date | null;
    if (args.previousDate) {
      previousDate = parsePeriodDate(args.previousDate);
    } else {
      const backDays = period === "month" ? 30 : 7;
      previousDate = new Date(currentDate.getTime() - backDays * DAY_MS);
    }
    if (!previousDate) return toolError("previousDate debe usar formato YYYY-MM-DD.");

    const result = await comparePeriods(toSession(ctx), { period, currentDate, previousDate });
    return toolOk(result);
  }
});
