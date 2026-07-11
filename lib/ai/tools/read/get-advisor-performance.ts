import { z } from "zod";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { resolveStoreTeammate } from "@/lib/ai/tools/resolve-teammate";
import { isStoreManager, managerOnlyAdvisorQueryError } from "@/lib/ai/tools/role-guards";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { kpiPerformanceFields, kpiPeriodMeta } from "@/lib/services/kpi-period-meta";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport } from "@/lib/services/kpi-service";

const argsSchema = z.object({
  /** Nombre o número de empleado (preferido). Solo gerencia. */
  advisor: z.string().min(1).optional(),
  /** @deprecated Preferir `advisor`. Solo gerencia. */
  userId: z.string().min(1).optional(),
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function publicAdvisor(item: {
  userId: string;
  userName: string;
  role: string;
  sales: number;
  goal: number;
  achievement: number;
  ranking: number;
  upt: number | null;
  conversion: number | null;
  transactions: number;
  pieces: number;
}) {
  const perf = kpiPerformanceFields(item);
  return {
    name: item.userName,
    role: item.role,
    sales: perf.sales,
    goal: perf.goal,
    achievement: perf.achievement,
    remainingToGoal: perf.remainingToGoal,
    ranking: item.ranking,
    upt: perf.upt,
    conversion: perf.conversion,
    transactions: perf.transactions,
    pieces: perf.pieces
  };
}

// Desempeño por asesor (KPIs y ranking) del periodo. Un asesor solo puede
// consultar SU propio desempeño; gerencia puede pedir uno específico de su
// tienda o el ranking completo del equipo.
export const getAdvisorPerformanceTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getAdvisorPerformance",
  description:
    "Desempeño por ASESOR o ranking del equipo en periodo RETAIL (semana/mes RDV). Incluye ventas, meta, alcance, remainingToGoal, UPT y conversión. NO uses para totales de TIENDA ni faltante global — usa getStorePerformance. advisor solo gerencia.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      advisor: {
        type: "string",
        description: "SOLO gerencia. Nombre o número de empleado. Ej: 'Alonso', '113642'. Los asesores no deben enviar este campo."
      },
      period: { type: "string", enum: ["week", "month"], description: "Periodo RETAIL RDV. Por defecto 'week'." },
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
    const periodMeta = kpiPeriodMeta(report);

    if (ctx.role === "ASESOR") {
      if (args.advisor || args.userId) {
        return toolError(managerOnlyAdvisorQueryError());
      }
      return toolOk({
        ...periodMeta,
        scope: "own",
        advisor: report.own ? publicAdvisor(report.own) : null
      });
    }

    if (!isStoreManager(ctx.role)) {
      return toolError(managerOnlyAdvisorQueryError());
    }

    let resolvedUserId = args.userId;
    const query = args.advisor?.trim();
    if (query) {
      const resolved = await resolveStoreTeammate(ctx.storeId, query);
      if (resolved.status === "not_found") return toolError(resolved.error);
      if (resolved.status === "ambiguous") {
        return toolOk({
          scope: "ambiguous",
          message: "Hay varios colaboradores que coinciden. Pregunta al usuario cuál (solo con el nombre).",
          candidates: resolved.candidates
        });
      }
      resolvedUserId = resolved.user.id;
    }

    if (!resolvedUserId) {
      return toolOk({
        ...periodMeta,
        scope: "team",
        team: report.team.map((item) => publicAdvisor(item))
      });
    }

    const target = report.team.find((item) => item.userId === resolvedUserId)
      ?? (report.own?.userId === resolvedUserId ? report.own : null);
    if (!target) {
      return toolError("Ese colaborador está en tu tienda pero no tiene datos de desempeño en este periodo.");
    }
    return toolOk({ ...periodMeta, scope: "advisor", advisor: publicAdvisor(target) });
  }
});
