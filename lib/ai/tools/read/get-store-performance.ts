import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { isStoreManager } from "@/lib/ai/tools/role-guards";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { kpiPerformanceFields, kpiPeriodMeta } from "@/lib/ai/tools/shared/kpi-period-meta";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport } from "@/lib/services/kpi-service";

const argsSchema = z.object({
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// Totales del periodo retail (semana/mes): venta, meta, alcance y faltante.
// Misma fuente que la pestaña KPIs → Cumplimiento semanal/mensual.
export const getStorePerformanceTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getStorePerformance",
  description:
    "OBLIGATORIA para meta del periodo, alcance % y cuánto falta (remainingToGoal). Devuelve totales RETAIL de tienda (gerencia) o propios (asesor). Mismos números que pestaña KPIs → Cumplimiento. period='week' por defecto (NO uses mes natural). NO uses getStoreDailyResults (solo es del DÍA).",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["week", "month"],
        description: "Periodo RETAIL RDV. Por defecto 'week' (vista Semana en KPIs). 'month' solo si el usuario pide mes/mensual."
      },
      date: { type: "string", description: "Fecha YYYY-MM-DD dentro del periodo retail. Opcional; por defecto hoy." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const period = args.period ?? "week";
    const selectedDate = args.date ? parsePeriodDate(args.date) : parsePeriodDate(null, ctx.now);
    if (!selectedDate) return toolError("La fecha debe usar formato YYYY-MM-DD.");

    const report = await getKpiReport(toSession(ctx), { period, selectedDate });
    const periodMeta = {
      ...kpiPeriodMeta(report),
      formulasNote: "No recalcules: achievement, remainingToGoal, upt y conversion ya vienen calculados."
    };

    if (ctx.role === "ASESOR") {
      if (!report.own) return toolError("No hay datos de desempeño para ti en este periodo.");
      return toolOk({
        ...periodMeta,
        scope: "own",
        performance: kpiPerformanceFields(report.own)
      });
    }

    if (!isStoreManager(ctx.role)) {
      return toolError("Tu rol no tiene acceso a los totales de tienda en el Copilot.");
    }

    if (!report.store) {
      return toolError("No hay datos de tienda en este periodo.");
    }

    return toolOk({
      ...periodMeta,
      scope: "store",
      performance: kpiPerformanceFields(report.store)
    });
  }
});
