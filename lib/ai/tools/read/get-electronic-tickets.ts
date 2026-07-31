import { z } from "zod";
import { defineTool, toolOk } from "@/lib/ai/tools/tool";
import { prisma } from "@/lib/prisma";
import { isStoreManager } from "@/lib/ai/tools/role-guards";
import { reportedRate, rateStatus, sumTickets, targetValue } from "@/lib/electronic-tickets";

const argsSchema = z.object({
  scope: z.enum(["propio", "tienda", "equipo"]).optional()
});

/**
 * Ticket electrónico: qué porcentaje de los tickets salió con datos del cliente.
 *
 * Es el indicador con el que el corporativo presiona a la tienda, así que el
 * Copilot tiene que poder responderlo sin que nadie abra una pantalla.
 *
 * Dos cosas que esta herramienta NO hace y son deliberadas:
 *
 *  1. No divide entre los tickets totales del periodo, sino entre el
 *     denominador congelado al capturar. Ese cubre exactamente las semanas
 *     medidas; usar el total hundiría la tasa fingiendo ceros donde todavía no
 *     se ha capturado nada.
 *
 *  2. No devuelve 0 cuando falta el dato, devuelve null. Un cero acusaría al
 *     asesor de no haber capturado ninguno, que es una afirmación distinta a
 *     «no lo hemos medido». El modelo tiene instrucción de decir «sin datos».
 */
export const getElectronicTicketsTool = defineTool<z.infer<typeof argsSchema>>({
  name: "getElectronicTickets",
  description:
    "Porcentaje de captura del TICKET ELECTRÓNICO (cuántos tickets salieron con los datos del cliente) del mes retail en curso, con su meta. Para asesor devuelve solo lo suyo; para gerencia, lo suyo, lo de la tienda y el desglose por asesor. Úsala cuando pregunten por ticket electrónico, captura de clientes o CRM.",
  phase: 1,
  roles: "all",
  mutates: false,
  parameters: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["propio", "tienda", "equipo"],
        description: "Qué mirar. Por defecto: el asesor ve lo propio y gerencia ve todo."
      }
    },
    additionalProperties: false
  },
  argsSchema,
  async execute(ctx) {
    const manager = isStoreManager(ctx.role);

    // Solo las filas con captura. Viven en la fila ancla de cada semana, así
    // que sumarlas da el total del periodo sin duplicar (ver CLAUDE.md).
    const rows = await prisma.kpi.findMany({
      where: {
        storeId: ctx.storeId,
        crmTransactions: { not: null },
        ...(manager ? {} : { userId: ctx.userId })
      },
      orderBy: { date: "desc" },
      take: 400,
      select: {
        userId: true,
        weekNumber: true,
        crmTransactions: true,
        posTransactions: true,
        user: { select: { name: true, role: true, active: true } }
      }
    });

    if (rows.length === 0) {
      return toolOk({
        disponible: false,
        motivo: "Todavía no se ha capturado ticket electrónico. Se captura por semana desde Centro de Datos."
      });
    }

    const targets = await prisma.kpiTarget.findMany({
      where: { storeId: ctx.storeId, metric: { startsWith: "ticketElectronico" } },
      select: { metric: true, value: true }
    });
    const plain = targets.map((target) => ({ metric: target.metric, value: Number(target.value) }));
    const metaTienda = targetValue(plain, "ticketElectronicoTienda");
    const metaAsesor = targetValue(plain, "ticketElectronicoAsesor");

    // Agregado por persona.
    const byUser = new Map<string, { nombre: string; rol: string; crm: number; tickets: number; semanas: Set<number> }>();
    for (const row of rows) {
      if (!row.user.active) continue;
      const current = byUser.get(row.userId) ?? { nombre: row.user.name, rol: row.user.role, crm: 0, tickets: 0, semanas: new Set<number>() };
      current.crm += row.crmTransactions ?? 0;
      current.tickets += row.posTransactions ?? 0;
      if (row.weekNumber !== null) current.semanas.add(row.weekNumber);
      byUser.set(row.userId, current);
    }

    const people = Array.from(byUser.values()).map((person) => {
      const line = { crmTransactions: person.crm, posTransactions: person.tickets };
      const rate = reportedRate(line);
      const meta = person.rol === "ASESOR" ? metaAsesor : metaTienda;
      return {
        nombre: person.nombre,
        rol: person.rol,
        electronicos: person.crm,
        tickets: person.tickets,
        // Redondeado a un decimal: el modelo no debe inventarse precisión.
        tasa: rate === null ? null : Math.round(rate * 10) / 10,
        meta,
        estado: rateStatus(rate, meta),
        semanasCapturadas: person.semanas.size
      };
    });

    const advisors = people.filter((person) => person.rol === "ASESOR");
    const teamTotals = sumTickets(advisors.map((person) => ({ crmTransactions: person.electronicos, posTransactions: person.tickets })));
    const storeTotals = sumTickets(people.map((person) => ({ crmTransactions: person.electronicos, posTransactions: person.tickets })));
    const teamRate = reportedRate(teamTotals);
    const storeRate = reportedRate(storeTotals);

    const own = people.find((person) => person.nombre === ctx.name) ?? null;

    if (!manager) {
      return toolOk({
        disponible: true,
        alcance: "propio",
        // El asesor no ve tienda ni equipo: la herramienta ya filtró por userId,
        // pero se explicita para que el modelo no intente completarlo.
        propio: people[0] ?? null,
        meta: metaAsesor,
        nota: metaAsesor === null ? "No hay meta de asesor configurada." : undefined
      });
    }

    return toolOk({
      disponible: true,
      alcance: "gerencia",
      propio: own,
      tienda: {
        electronicos: storeTotals.crmTransactions,
        tickets: storeTotals.posTransactions,
        tasa: storeRate === null ? null : Math.round(storeRate * 10) / 10,
        meta: metaTienda,
        estado: rateStatus(storeRate, metaTienda)
      },
      equipo: {
        electronicos: teamTotals.crmTransactions,
        tickets: teamTotals.posTransactions,
        tasa: teamRate === null ? null : Math.round(teamRate * 10) / 10,
        meta: metaAsesor,
        estado: rateStatus(teamRate, metaAsesor)
      },
      // Ordenado de menor a mayor: el que necesita ayuda va primero, que es lo
      // que gerencia busca cuando pregunta.
      asesores: advisors.sort((a, b) => (a.tasa ?? 999) - (b.tasa ?? 999)),
      metas: { tienda: metaTienda, asesor: metaAsesor },
      nota: metaTienda === null && metaAsesor === null
        ? "No hay metas configuradas para ticket electrónico; se pueden poner en KPIs → Metas."
        : undefined
    });
  }
});
