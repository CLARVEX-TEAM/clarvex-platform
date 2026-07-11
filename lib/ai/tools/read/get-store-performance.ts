import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { isStoreManager } from "@/lib/ai/tools/role-guards";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport } from "@/lib/services/kpi-service";

const argsSchema = z.object({
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function periodPerformance(kpi: {
  sales: number;
  goal: number;
  achievement: number;
  transactions: number;
  pieces: number;
  upt: number | null;
  conversion: number | null;
  traffic: number | null;
}) {
  const remainingToGoal = Math.round(Math.max(kpi.goal - kpi.sales, 0) * 100) / 100;
  const surpassedBy = Math.round(Math.max(kpi.sales - kpi.goal, 0) * 100) / 100;
  return {
    sales: kpi.sales,
    goal: kpi.goal,
    achievement: kpi.achievement,
    remainingToGoal,
    surpassedBy,
    atOrAboveGoal: kpi.sales >= kpi.goal,
    transactions: kpi.transactions,
    pieces: kpi.pieces,
    upt: kpi.upt,
    conversion: kpi.conversion,
    traffic: kpi.traffic
  };
}

// Totales del periodo retail (semana/mes): venta, meta, alcance y faltante.
// Misma fuente que la pestaña KPIs → Cumplimiento semanal/mensual.
export const getStorePerformanceTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getStorePerformance",
  description:
    "Devuelve ventas, meta, alcance % y cuánto falta (remainingToGoal) o sobra para el 100% del periodo retail (semana o mes). Gerencia = totales de TIENDA (idénticos a pestaña KPIs → Cumplimiento). Asesor = sus propios totales del periodo. Úsala para 'cuánto falta para la meta', 'cuánto llevamos de la meta semanal/mensual' o alcance del periodo. NO uses getStoreDailyResults para eso (esa herramienta es solo del DÍA). Por defecto periodo 'week' salvo que el usuario diga mes/mensual.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["week", "month"], description: "Periodo retail. Por defecto 'week' (igual que la pestaña KPIs al abrir)." },
      date: { type: "string", description: "Fecha YYYY-MM-DD dentro del periodo. Opcional; por defecto hoy." }
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
      period: report.period,
      startDate: report.startDate,
      endDate: report.endDate,
      weekNumber: report.weekNumber,
      retailMonthLabel: report.retailMonthLabel,
      note: "Mismos números que pestaña KPIs (Cumplimiento). remainingToGoal = meta − venta cuando venta < meta."
    };

    if (ctx.role === "ASESOR") {
      if (!report.own) return toolError("No hay datos de desempeño para ti en este periodo.");
      return toolOk({
        ...periodMeta,
        scope: "own",
        performance: periodPerformance(report.own)
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
      performance: periodPerformance(report.store)
    });
  }
});
