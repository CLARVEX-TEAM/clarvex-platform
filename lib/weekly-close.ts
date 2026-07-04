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
};

const ROLE_ORDER: Record<KpiReportItem["role"], number> = { GERENTE: 0, SUBGERENTE: 1, ASESOR: 2 };

export function buildWeeklyCloseColumns(members: KpiReportItem[], store: KpiReportItem): WeeklyCloseColumn[] {
  return [...members]
    .sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role] || left.userName.localeCompare(right.userName, "es"))
    .map((member) => buildWeeklyCloseColumn(member, store));
}

export function buildWeeklyCloseColumn(item: KpiReportItem, store: KpiReportItem): WeeklyCloseColumn {
  // Las pérdidas se calculan con los valores crudos (venta/tickets/piezas),
  // no con los KPIs ya redondeados, para replicar el Excel original.
  const hasOwn = item.transactions > 0 && item.pieces > 0;
  const hasStore = store.transactions > 0 && store.pieces > 0;
  const lossEpt = hasOwn && hasStore ? round2((item.sales / item.transactions - store.sales / store.transactions) * item.transactions) : null;
  const lossUpt = hasOwn && hasStore ? round2((item.pieces / item.transactions - store.pieces / store.transactions) * item.transactions * (item.sales / item.pieces)) : null;
  const lossAur = hasOwn && hasStore ? round2((item.sales / item.pieces - store.sales / store.pieces) * item.pieces) : null;
  return {
    name: item.userName,
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
    focus: computeFocus(item, lossUpt, lossAur)
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
