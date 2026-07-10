import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport } from "@/lib/services/kpi-service";

const argsSchema = z.object({
  userId: z.string().min(1).optional(),
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// Desempeño por asesor (KPIs y ranking) del periodo. Un asesor solo puede
// consultar SU propio desempeño; gerencia puede pedir uno específico de su
// tienda o el ranking completo del equipo.
export const getAdvisorPerformanceTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getAdvisorPerformance",
  description: "Devuelve el desempeño (ventas, meta, alcance, UPT, conversión, ranking) de un asesor o del equipo en el periodo (semana/mes retail). Si no se indica userId y el usuario es gerencia, devuelve el ranking del equipo. Un asesor solo obtiene sus propios datos.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      userId: { type: "string", description: "ID del asesor a consultar (solo gerencia). Opcional." },
      period: { type: "string", enum: ["week", "month"], description: "Periodo retail. Por defecto 'week'." },
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

    // Asesor: siempre sus propios datos, ignorando cualquier userId del modelo.
    if (ctx.role === "ASESOR") {
      return toolOk({ period, scope: "own", advisor: report.own });
    }

    // Gerencia sin userId → ranking del equipo (ya aislado a la tienda).
    if (!args.userId) {
      return toolOk({
        period,
        scope: "team",
        team: report.team.map((item) => ({
          userId: item.userId,
          name: item.userName,
          role: item.role,
          sales: item.sales,
          goal: item.goal,
          achievement: item.achievement,
          ranking: item.ranking,
          upt: item.upt,
          conversion: item.conversion
        }))
      });
    }

    // Gerencia con userId: solo válido si el asesor pertenece a la tienda (el
    // reporte ya está acotado a session.storeId, así que si no aparece, no es
    // de esta tienda).
    const target = report.team.find((item) => item.userId === args.userId)
      ?? (report.own?.userId === args.userId ? report.own : null);
    if (!target) return toolError("El colaborador no pertenece a tu tienda o no tiene datos en el periodo.");
    return toolOk({ period, scope: "advisor", advisor: target });
  }
});
