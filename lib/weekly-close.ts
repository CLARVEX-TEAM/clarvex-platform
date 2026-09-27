import type { KpiReportItem } from "./kpi-report";

// Cierre de semana formato "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)".
// Fórmulas de pérdida verificadas contra el formato original de tienda:
//   Pérdida EPT = (EPT asesor − EPT tienda) × tickets del asesor
//   Pérdida UPT = (UPT asesor − UPT tienda) × tickets × AUR del asesor
//   Pérdida AUR = (AUR asesor − AUR tienda) × piezas del asesor
// Indicador a trabajar: entre UPT y AUR, el de mayor pérdida (más negativo);
// si ambos van en positivo → FELICIDADES; sin venta/tickets → SIN DATOS.

export type WeeklyCloseFocus = "UPT" | "AUR" | "FELICIDADES" | "SIN DATOS";

export type WeeklyCloseColumn = {
  userId: string;
  name: string;
  role: KpiReportItem["role"];
  goal: number;
  sales: number;
  difference: number;
  achievement: number;
  transactions: number;
  pieces: number;
  traffic: number | null;
  ept: number | null;
  upt: number | null;
  aur: number | null;
  tc: number | null;
  lossEpt: number | null;
  lossUpt: number | null;
  lossAur: number | null;
  focus: WeeklyCloseFocus;
  // Sección WHATSAPP (ORKESTRA del RDV). Meta = PPTO repartido en partes
  // iguales entre los asesores con venta esa semana.
  waMeta: number | null;
  waSales: number | null;
  waTransactions: number | null;
  waPieces: number | null;
};

const ROLE_ORDER: Record<KpiReportItem["role"], number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2, REGIONAL: 3 };

/**
 * El orden de las columnas cuando el RDV no lo dicta: puesto, y dentro de cada
 * puesto el NÚMERO DE EMPLEADO, de menor a mayor.
 *
 * ⚠️ **Antes desempataba por NOMBRE y salía alfabético** --Alonso, Jazmín,
 * Waira--, que no es el orden en el que la tienda los lee ni el que traía el
 * RDV. El número de empleado sí: es el orden de antigüedad en la empresa, lo
 * asigna corporativo y nadie lo mantiene a mano, así que quien entre mañana se
 * coloca solo.
 *
 * ⚠️ **Y se compara como NÚMERO, no como texto.** `employeeNumber` es una
 * cadena: ordenada tal cual, `113642` va antes que `95739` porque empieza por
 * uno, y el resultado es justo el contrario del que se busca.
 *
 * ⚠️ La consulta de Retool que pinta Horarios ordena igual, a mano, en SQL. Si
 * una de las dos cambia, la otra tiene que cambiar con ella: son dos copias de
 * la misma regla y no hay nada que las ate.
 */
export function ordenDelEquipo(
  gente: Array<{ id: string; role: KpiReportItem["role"]; employeeNumber: string }>
): Map<string, number> {
  const numero = (valor: string) => {
    const n = Number.parseInt(valor, 10);
    // Un número que no lo es va al final, no al principio: `NaN` en una
    // comparación deja el orden indefinido y sería peor que ponerlo último.
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const ordenada = [...gente].sort(
    (izq, der) =>
      (ROLE_ORDER[izq.role] ?? 99) - (ROLE_ORDER[der.role] ?? 99)
      || numero(izq.employeeNumber) - numero(der.employeeNumber)
  );
  return new Map(ordenada.map((persona, posicion) => [persona.id, posicion]));
}

export function buildWeeklyCloseColumns(
  members: KpiReportItem[],
  store: KpiReportItem,
  whatsappBudget: number | null = null,
  waMetaByUser: Map<string, number> | null = null,
  rdvOrder: Map<string, number> | null = null
): WeeklyCloseColumn[] {
  // Orden de columnas: el mismo del RDV (gerente, subgerentes, vendedor 1, 2…)
  // cuando el sync lo reporta, y si no, el que arma `ordenDelEquipo` --puesto y
  // número de empleado--. Quien no esté en ninguno de los dos va al final.
  //
  // ⚠️ El desempate por NOMBRE se quitó a propósito: dejaba a los asesores en
  // alfabético, que no es como los lee la tienda. Se conserva al final solo
  // para que dos personas sin orden conocido salgan siempre igual y el archivo
  // no cambie de una exportación a otra.
  const position = (item: KpiReportItem) => rdvOrder?.get(item.userId) ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...members]
    .sort((left, right) =>
      position(left) - position(right)
      || ROLE_ORDER[left.role] - ROLE_ORDER[right.role]
      || left.userName.localeCompare(right.userName, "es"));
  // Con horarios sincronizados la meta se reparte por días laborados; sin
  // horarios, en partes iguales entre quienes tuvieron venta (fallback).
  if (waMetaByUser && waMetaByUser.size > 0) {
    return ordered.map((member) => {
      const meta = waMetaByUser.get(member.userId) ?? 0;
      return buildWeeklyCloseColumn(member, store, meta > 0 ? round2(meta) : null);
    });
  }
  const withSales = ordered.filter((member) => member.sales > 0).length;
  const metaShare = whatsappBudget !== null && whatsappBudget > 0 && withSales > 0 ? round2(whatsappBudget / withSales) : null;
  return ordered.map((member) => buildWeeklyCloseColumn(member, store, member.sales > 0 ? metaShare : null));
}

// % fijos de la lógica de HORARIOS: gerente y subgerente reciben una fracción
// fija del PPTO diario cuando laboran; el resto se divide en partes iguales
// entre los asesores presentes ese día.
export const WA_MANAGER_SHARE = 0.1;
export const WA_ASSISTANT_SHARE = 0.15;

/**
 * Reparte el PPTO semanal de WhatsApp según los días laborados (hoja HORARIOS):
 * PPTO÷7 por día; cada día solo participan quienes laboran — gerente 10% fijo,
 * subgerente 15% fijo y el remanente en partes iguales entre asesores presentes.
 */
export function distributeWhatsappBudget(
  budget: number,
  presenceByDay: Map<string, Set<string>>,
  roles: Map<string, KpiReportItem["role"]>
): Map<string, number> {
  const totals = new Map<string, number>();
  if (budget <= 0) return totals;
  const daily = budget / 7;
  const add = (userId: string, amount: number) => totals.set(userId, (totals.get(userId) ?? 0) + amount);
  for (const present of Array.from(presenceByDay.values())) {
    const users = Array.from(present);
    if (users.length === 0) continue;
    const fixed = users.map((userId) => ({
      userId,
      share: roles.get(userId) === "GERENTE" ? WA_MANAGER_SHARE : roles.get(userId) === "SUBGERENTE" ? WA_ASSISTANT_SHARE : 0
    }));
    const fixedSum = fixed.reduce((total, item) => total + item.share, 0);
    const advisors = users.filter((userId) => (roles.get(userId) ?? "ASESOR") === "ASESOR");
    const remainder = Math.max(0, 1 - fixedSum);
    for (const item of fixed) if (item.share > 0) add(item.userId, daily * item.share);
    if (advisors.length > 0) {
      for (const userId of advisors) add(userId, (daily * remainder) / advisors.length);
    } else if (fixedSum > 0) {
      // Solo gerencia presente: el remanente se reparte proporcional a su % fijo
      for (const item of fixed) if (item.share > 0) add(item.userId, daily * remainder * (item.share / fixedSum));
    }
  }
  for (const entry of Array.from(totals.entries())) totals.set(entry[0], round2(entry[1]));
  return totals;
}

export function buildWeeklyCloseColumn(item: KpiReportItem, store: KpiReportItem, waMeta: number | null = null): WeeklyCloseColumn {
  // Las pérdidas se calculan con los valores crudos (venta/tickets/piezas),
  // no con los KPIs ya redondeados, para replicar el Excel original.
  const hasOwn = item.transactions > 0 && item.pieces > 0;
  const hasStore = store.transactions > 0 && store.pieces > 0;
  const lossEpt = hasOwn && hasStore ? round2((item.sales / item.transactions - store.sales / store.transactions) * item.transactions) : null;
  const lossUpt = hasOwn && hasStore ? round2((item.pieces / item.transactions - store.pieces / store.transactions) * item.transactions * (item.sales / item.pieces)) : null;
  const lossAur = hasOwn && hasStore ? round2((item.sales / item.pieces - store.sales / store.pieces) * item.pieces) : null;
  return {
    userId: item.userId,
    name: firstName(item.userName),
    role: item.role,
    goal: item.goal,
    sales: item.sales,
    difference: round2(item.sales - item.goal),
    achievement: item.achievement,
    transactions: item.transactions,
    pieces: item.pieces,
    traffic: item.traffic,
    ept: item.ept,
    upt: item.upt,
    aur: item.aur,
    tc: item.conversion,
    lossEpt,
    lossUpt,
    lossAur,
    focus: computeFocus(item, lossUpt, lossAur),
    waMeta,
    waSales: item.orkestraSales,
    waTransactions: item.orkestraTransactions,
    waPieces: item.orkestraPieces
  };
}

function computeFocus(item: KpiReportItem, lossUpt: number | null, lossAur: number | null): WeeklyCloseFocus {
  if (item.transactions <= 0 || item.sales <= 0) return "SIN DATOS";
  const candidates: Array<{ key: "UPT" | "AUR"; loss: number }> = [];
  if (lossUpt !== null) candidates.push({ key: "UPT", loss: lossUpt });
  if (lossAur !== null) candidates.push({ key: "AUR", loss: lossAur });
  if (candidates.length === 0) return "SIN DATOS";
  const negative = candidates.filter((candidate) => candidate.loss < 0).sort((left, right) => left.loss - right.loss);
  return negative.length === 0 ? "FELICIDADES" : negative[0].key;
}

function round2(value: number) { return Math.round(value * 100) / 100; }

/**
 * Nombre corto en formato título, como el formato de tienda.
 * Adrian usa su segundo nombre de forma habitual, no "Jesus".
 */
export function firstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.toLocaleUpperCase("es-MX") === "JESUS"
    && parts[1]?.toLocaleUpperCase("es-MX") === "ADRIAN"
    ? parts[1]
    : parts[0] ?? "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
