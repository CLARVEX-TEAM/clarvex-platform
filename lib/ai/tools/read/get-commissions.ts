import { z } from "zod";
import { computeNextBracketGap, findCommissionRule, resolveCommissionMinimum } from "@/lib/commission";
import { getAchievement } from "@/lib/kpi-view";
import { parsePeriodDate } from "@/lib/kpi-period";
import { getKpiReport, type KpiReport } from "@/lib/services/kpi-service";
import { defineTool, toolError, toolOk } from "@/lib/ai/tools/tool";
import { toSession } from "@/lib/ai/tools/session-adapter";
import type { CommissionRule, Role } from "@/lib/types";

const argsSchema = z.object({
  userId: z.string().min(1).optional(),
  period: z.enum(["week", "month"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

type CommissionPerson = {
  userId: string;
  name: string;
  role: Role;
  sales: number;
  goal: number;
  minimum: number;
  achievementVsMinimum: number;
  commissionPercent: number;
  commissionAmount: number;
  hasMinimum: boolean;
  nextBracket: ReturnType<typeof computeNextBracketGap>;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Misma lectura que la pestaña KPIs → Comisión (useKpiDerived). No recalcula reglas. */
export function buildCommissionPerson(
  item: {
    userId: string;
    userName: string;
    role: Role;
    sales: number;
    goal: number;
    commissionMinimum: number | null;
  },
  rules: CommissionRule[],
  commissionRole: Role
): CommissionPerson {
  const minimum = resolveCommissionMinimum(item.commissionMinimum, item.goal);
  const hasMinimum = minimum > 0;
  const achievementVsMinimum = hasMinimum ? getAchievement(item.sales, minimum) : 0;
  const activeRule = hasMinimum ? findCommissionRule(rules, commissionRole, achievementVsMinimum) : undefined;
  const commissionPercent = activeRule?.commissionPercent ?? 0;
  const commissionAmount = hasMinimum ? round2(item.sales * (commissionPercent / 100)) : 0;
  const nextBracket = hasMinimum
    ? computeNextBracketGap({ sales: item.sales, minimum, rules, role: commissionRole })
    : null;

  return {
    userId: item.userId,
    name: item.userName,
    role: commissionRole,
    sales: item.sales,
    goal: item.goal,
    minimum,
    achievementVsMinimum: round2(achievementVsMinimum),
    commissionPercent,
    commissionAmount,
    hasMinimum,
    nextBracket
  };
}

function activeRulesSummary(rules: CommissionRule[]) {
  return rules
    .filter((rule) => rule.active && rule.role)
    .sort((a, b) => String(a.role).localeCompare(String(b.role)) || a.minAchievement - b.minAchievement)
    .map((rule) => ({
      role: rule.role as Role,
      minAchievement: rule.minAchievement,
      maxAchievement: rule.maxAchievement ?? null,
      commissionPercent: rule.commissionPercent
    }));
}

function pickClosest(team: CommissionPerson[]): CommissionPerson | null {
  const candidates = team
    .filter((person) => person.hasMinimum && person.nextBracket && !person.nextBracket.atTop)
    .sort((a, b) => (a.nextBracket?.salesNeeded ?? Infinity) - (b.nextBracket?.salesNeeded ?? Infinity));
  return candidates[0] ?? null;
}

function buildPayload(report: KpiReport, ctxRole: Role, userId?: string) {
  const rules = report.commissionRules;
  const periodMeta = {
    period: report.period,
    startDate: report.startDate,
    endDate: report.endDate,
    weekNumber: report.weekNumber,
    retailMonthLabel: report.retailMonthLabel,
    note: "Alcance de comisión = venta ÷ mínimo (igual que pestaña KPIs → Comisión). La IA no recalcula."
  };

  if (ctxRole === "ASESOR") {
    if (!report.own) return toolError("No hay datos de comisión para ti en este periodo.");
    const own = buildCommissionPerson(report.own, rules, "ASESOR");
    return toolOk({
      ...periodMeta,
      scope: "own",
      own,
      activeRules: activeRulesSummary(rules).filter((rule) => rule.role === "ASESOR")
    });
  }

  // Gerencia: comisión propia = tienda (venta/mínimo TOTALES) con su rol.
  const store = report.store;
  if (!store) return toolError("No hay datos de tienda para comisiones en este periodo.");

  const own = buildCommissionPerson(
    { ...store, userName: ctxRole === "GERENTE" ? "Tienda (GERENTE)" : "Tienda (SUBGERENTE)" },
    rules,
    ctxRole
  );

  const team = report.team
    .filter((item) => item.role === "ASESOR")
    .map((item) => buildCommissionPerson(item, rules, "ASESOR"))
    .sort((a, b) => b.commissionAmount - a.commissionAmount || b.achievementVsMinimum - a.achievementVsMinimum);

  if (userId) {
    const target = team.find((item) => item.userId === userId);
    if (!target) return toolError("El colaborador no pertenece a tu tienda o no tiene datos en el periodo.");
    return toolOk({
      ...periodMeta,
      scope: "advisor",
      advisor: target,
      activeRules: activeRulesSummary(rules)
    });
  }

  const closest = pickClosest(team);
  return toolOk({
    ...periodMeta,
    scope: "team",
    own,
    team,
    closestToNextLevel: closest
      ? {
          userId: closest.userId,
          name: closest.name,
          salesNeeded: closest.nextBracket?.salesNeeded ?? 0,
          currentPercent: closest.nextBracket?.currentPercent ?? closest.commissionPercent,
          nextPercent: closest.nextBracket?.nextPercent ?? closest.commissionPercent,
          achievementVsMinimum: closest.achievementVsMinimum
        }
      : null,
    activeRules: activeRulesSummary(rules)
  });
}

// Comisiones de ventas del periodo (semana/mes retail). Misma fuente y mismas
// fórmulas de lectura que la pestaña KPIs → Comisión. Un asesor solo ve las suyas.
export const getCommissionsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getCommissions",
  description:
    "Devuelve comisiones de ventas del periodo (monto, %, alcance vs mínimo, reglas activas y cuánto falta al siguiente nivel). Úsala para 'mis comisiones', 'quién está más cerca de comisionar' o 'qué brackets/reglas tenemos'. Gerencia ve tienda + equipo; un asesor solo las suyas.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      userId: { type: "string", description: "ID del asesor a consultar (solo gerencia). Opcional." },
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
    // Asesor: siempre propias, ignorando userId del modelo.
    if (ctx.role === "ASESOR") {
      return buildPayload(report, ctx.role);
    }
    return buildPayload(report, ctx.role, args.userId);
  }
});
