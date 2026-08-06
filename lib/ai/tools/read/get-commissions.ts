import { z } from "zod";
import {
  activeCommissionRulesSummary,
  buildCommissionPerson,
  pickClosestToNextBracket,
  publicCommissionPerson
} from "@/lib/commission-read";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport, type KpiReport } from "@/lib/services/kpi-service";
import { resolveStoreTeammate } from "@/lib/ai/tools/resolve-teammate";
import { isStoreManager, managerOnlyAdvisorQueryError } from "@/lib/ai/tools/role-guards";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import { kpiPeriodMeta } from "@/lib/services/kpi-period-meta";
import type { Role } from "@/lib/types";

const argsSchema = z.object({
  /** Nombre o número de empleado (preferido). Nunca pedir UUID al usuario. */
  advisor: z.string().min(1).optional(),
  /** @deprecated Solo compatibilidad interna; preferir `advisor`. */
  userId: z.string().min(1).optional(),
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function buildPayload(report: KpiReport, ctxRole: Role, resolvedUserId?: string) {
  const rules = report.commissionRules;
  const basis = report.commissionBasis;
  const periodMeta = {
    ...kpiPeriodMeta(report),
    // La nota le dice al modelo contra QUÉ se mide. Si dijera "mínimo" en una
    // tienda de base META, el Copilot explicaría mal un número correcto.
    note: basis === "META"
      ? "Mismos números que pestaña KPIs → Comisión. Alcance comisión = venta ÷ META (esta tienda mide contra la meta)."
      : "Mismos números que pestaña KPIs → Comisión. Alcance comisión = venta ÷ mínimo (NO venta÷meta).",
    formatHint: "Para cada persona: Nombre — comisión $X (Y%) — alcance vs mínimo Z%. Evita tablas con muchas columnas."
  };

  if (ctxRole === "ASESOR") {
    if (!report.own) return toolError("No hay datos de comisión para ti en este periodo.");
    const own = buildCommissionPerson(report.own, rules, "ASESOR", basis);
    return toolOk({
      ...periodMeta,
      scope: "own",
      own: publicCommissionPerson(own),
      activeRules: activeCommissionRulesSummary(rules).filter((rule) => rule.role === "ASESOR")
    });
  }

  if (ctxRole !== "GERENTE" && ctxRole !== "SUBGERENTE") {
    return toolError("Tu rol no tiene acceso a comisiones de ventas en el Copilot.");
  }
  const store = report.store;
  if (!store) return toolError("No hay datos de tienda para comisiones en este periodo.");

  const own = buildCommissionPerson(
    { ...store, userName: ctxRole === "GERENTE" ? "Tienda (GERENTE)" : "Tienda (SUBGERENTE)" },
    rules,
    ctxRole,
    basis
  );

  const team = report.team
    .filter((item) => item.role === "ASESOR")
    .map((item) => buildCommissionPerson(item, rules, "ASESOR", basis))
    .sort((a, b) => b.commissionAmount - a.commissionAmount || b.achievementVsMinimum - a.achievementVsMinimum);

  if (resolvedUserId) {
    const target = team.find((item) => item.userId === resolvedUserId);
    if (!target) {
      return toolError("Ese colaborador está en tu tienda pero no tiene datos de comisión en este periodo.");
    }
    return toolOk({
      ...periodMeta,
      scope: "advisor",
      advisor: publicCommissionPerson(target),
      activeRules: activeCommissionRulesSummary(rules).filter((rule) => rule.role === "ASESOR" || rule.role === ctxRole)
    });
  }

  const closest = pickClosestToNextBracket(team);
  return toolOk({
    ...periodMeta,
    scope: "team",
    own: publicCommissionPerson(own),
    team: team.map(publicCommissionPerson),
    closestToNextLevel: closest
      ? {
          name: closest.name,
          salesNeeded: closest.nextBracket?.salesNeeded ?? 0,
          currentPercent: closest.nextBracket?.currentPercent ?? closest.commissionPercent,
          nextPercent: closest.nextBracket?.nextPercent ?? closest.commissionPercent,
          achievementVsMinimum: closest.achievementVsMinimum
        }
      : null,
    activeRules: activeCommissionRulesSummary(rules)
  });
}

// Comisiones de ventas del periodo (semana/mes retail). Misma fuente y mismas
// fórmulas de lectura que la pestaña KPIs → Comisión. Un asesor solo ve las suyas.
export const getCommissionsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getCommissions",
  description:
    "Comisiones del periodo RETAIL RDV (monto, %, alcance vs mínimo, brackets). Alcance comisión = venta÷mínimo (NO meta). advisor solo gerencia.",
  phase: 1,
  roles: ["GERENTE", "SUBGERENTE", "ASESOR"],
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      advisor: {
        type: "string",
        description: "SOLO gerencia. Nombre o número de empleado del asesor. Ej: 'Alonso', '113642'. No uses UUID. Los asesores no deben enviar este campo."
      },
      period: { type: "string", enum: ["week", "month"], description: "Periodo retail. Por defecto 'month' (recibo de comisiones)." },
      date: { type: "string", description: "Fecha YYYY-MM-DD dentro del periodo. Opcional; por defecto hoy." }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx, args) {
    const period = args.period ?? "month";
    const selectedDate = args.date ? parsePeriodDate(args.date) : parsePeriodDate(null, ctx.now);
    if (!selectedDate) return toolError("La fecha debe usar formato YYYY-MM-DD.");

    const report = await getKpiReport(toSession(ctx), { period, selectedDate });
    if (ctx.role === "ASESOR") {
      if (args.advisor || args.userId) {
        return toolError(managerOnlyAdvisorQueryError());
      }
      return buildPayload(report, ctx.role);
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
          message: "Hay varios colaboradores que coinciden. Pregunta al usuario cuál (solo con el nombre, sin pedir ID).",
          candidates: resolved.candidates
        });
      }
      resolvedUserId = resolved.user.id;
    }

    return buildPayload(report, ctx.role, resolvedUserId);
  }
});
