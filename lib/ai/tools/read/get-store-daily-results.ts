import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { parsePeriodDate, periodDateKey } from "@/lib/kpi-period";
import { getStoreDailyResults } from "@/lib/services/kpi-service";

const argsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// Resultados del día (ventas, meta, alcance, tickets, piezas, conversión).
// Para gerencia = tienda completa; para asesor = sus propios números.
export const getStoreDailyResultsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getStoreDailyResults",
  description:
    "SOLO resultados del DÍA (hoy o fecha dada): ventas, meta diaria, alcance %, tickets, piezas, tráfico y conversión. NO es semana ni mes retail — para meta del periodo usa getStorePerformance.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "Fecha en formato YYYY-MM-DD. Opcional; por defecto hoy." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    let dateKey: string | undefined;
    if (args.date) {
      const parsed = parsePeriodDate(args.date);
      if (!parsed) return toolError("La fecha debe usar formato YYYY-MM-DD.");
      dateKey = periodDateKey(parsed);
    }
    const result = await getStoreDailyResults(toSession(ctx), dateKey);
    return toolOk({
      ...result,
      period: "day",
      periodLabel: `Día ${result.date}`,
      calendarNote: "Solo un día calendario. Para semana/mes retail (RDV) usa getStorePerformance."
    });
  }
});
