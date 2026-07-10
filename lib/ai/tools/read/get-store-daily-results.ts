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
  description: "Devuelve los resultados del día (ventas, meta, alcance %, tickets, piezas, tráfico y conversión). Para gerente/subgerente representa a toda la tienda; para asesor, solo sus propios resultados. Úsala para '¿cómo vamos hoy?' o '¿cómo voy hoy?'.",
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
    return toolOk(result);
  }
});
