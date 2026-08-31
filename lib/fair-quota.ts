export type FairQuotaRole = "GERENTE" | "SUBGERENTE" | "ASESOR";

export type FairQuotaPerson = { userId: string; name: string; role: FairQuotaRole; photoUrl?: string | null };
export type FairQuotaInput = {
  dates: string[];
  people: FairQuotaPerson[];
  minimums: Record<string, number>;
  presence: Record<string, string[]>;
  percentages?: Record<string, Record<string, number>>;
  upliftPercent?: number;
  whatsappBudget?: number;
};
export type FairQuotaAllocation = FairQuotaPerson & {
  present: boolean;
  percentage: number;
  goal: number;
  whatsappGoal: number;
};
export type FairQuotaDay = {
  date: string;
  minimum: number;
  storeGoal: number;
  percentageTotal: number;
  allocations: FairQuotaAllocation[];
};
export type FairQuotaResult = {
  upliftPercent: number;
  whatsappBudget: number;
  days: FairQuotaDay[];
  personTotals: Record<string, { goal: number; whatsappGoal: number }>;
  storeTotal: number;
  warnings: string[];
};

const MANAGER_SHARE = 10;
const ASSISTANT_SHARE = 15;

/** Motor único de Cuota Justa, independiente de Prisma y de la interfaz. */
export function calculateFairQuota(input: FairQuotaInput): FairQuotaResult {
  const upliftPercent = finiteBetween(input.upliftPercent ?? 15, 0, 100, "incremento");
  const whatsappBudget = nonNegative(input.whatsappBudget ?? 0, "presupuesto de WhatsApp");
  const warnings: string[] = [];
  const personTotals: FairQuotaResult["personTotals"] = Object.fromEntries(
    input.people.map((person) => [person.userId, { goal: 0, whatsappGoal: 0 }])
  );
  const dailyWhatsapp = input.dates.length > 0 ? whatsappBudget / input.dates.length : 0;

  const days = input.dates.map((date) => {
    const minimum = nonNegative(input.minimums[date] ?? 0, `mínimo de ${date}`);
    const storeGoal = roundMoney(minimum * (1 + upliftPercent / 100));
    const present = new Set(input.presence[date] ?? []);
    const suggested = suggestedPercentages(input.people, present);
    const manual = input.percentages?.[date];
    const percentages = manual ? validateManualPercentages(date, input.people, present, manual) : suggested;
    const percentageTotal = roundPercent(sum(Object.values(percentages)));
    if (present.size === 0 && storeGoal > 0) {
      throw new Error(`No hay personas laborando el ${date}; no se puede repartir una meta mayor a cero.`);
    }
    if (present.size === 0) warnings.push(`El ${date} no tiene personas laborando.`);

    const goals = allocateMoney(storeGoal, input.people, percentages);
    const whatsappGoals = allocateMoney(roundMoney(dailyWhatsapp), input.people, percentages);
    const allocations = input.people.map((person) => {
      const allocation = {
        ...person,
        present: present.has(person.userId),
        percentage: percentages[person.userId] ?? 0,
        goal: goals[person.userId] ?? 0,
        whatsappGoal: whatsappGoals[person.userId] ?? 0
      };
      personTotals[person.userId].goal = roundMoney(personTotals[person.userId].goal + allocation.goal);
      personTotals[person.userId].whatsappGoal = roundMoney(personTotals[person.userId].whatsappGoal + allocation.whatsappGoal);
      return allocation;
    });
    return { date, minimum, storeGoal, percentageTotal, allocations };
  });

  return {
    upliftPercent,
    whatsappBudget,
    days,
    personTotals,
    storeTotal: roundMoney(days.reduce((total, day) => total + day.storeGoal, 0)),
    warnings
  };
}

export function suggestedPercentages(people: FairQuotaPerson[], present: Set<string>): Record<string, number> {
  const result = Object.fromEntries(people.map((person) => [person.userId, 0]));
  const working = people.filter((person) => present.has(person.userId));
  if (working.length === 0) return result;
  const management = working.filter((person) => person.role !== "ASESOR");
  const advisors = working.filter((person) => person.role === "ASESOR");
  const fixed = management.map((person) => ({
    userId: person.userId,
    share: person.role === "GERENTE" ? MANAGER_SHARE : ASSISTANT_SHARE
  }));
  const fixedTotal = sum(fixed.map((item) => item.share));

  if (advisors.length > 0 && fixedTotal <= 100) {
    fixed.forEach((item) => { result[item.userId] = item.share; });
    const advisorShare = (100 - fixedTotal) / advisors.length;
    advisors.forEach((person) => { result[person.userId] = advisorShare; });
  } else if (fixedTotal > 0) {
    fixed.forEach((item) => { result[item.userId] = (item.share / fixedTotal) * 100; });
  } else {
    const share = 100 / working.length;
    working.forEach((person) => { result[person.userId] = share; });
  }
  normalizePercentages(result, working.map((person) => person.userId));
  return result;
}

export type PodaDePorcentajes = {
  percentages: Record<string, Record<string, number>>;
  /** Un aviso por día podado, listo para enseñar. */
  avisos: string[];
};

/**
 * Quita los porcentajes guardados que el horario ACTUAL ya no admite.
 *
 * ⚠️ **Al LEER se poda; al GUARDAR se rechaza.** No es incoherencia, es la
 * diferencia entre un borrador que se quedó viejo y alguien afirmando algo
 * imposible. Guardas la Cuota Justa, el equipo pide días, mueves los horarios,
 * y de pronto hay porcentajes para quien ya no labora: eso no es un error del
 * usuario, es el mundo cambiando debajo.
 *
 * Antes esto lanzaba también al leer, y **te dejaba fuera de la única pantalla
 * donde podías arreglarlo**. Pasó el 29 de agosto de 2026: seis días de la
 * semana quedaron bloqueados y hubo que editar el JSON en la base a mano.
 *
 * Se poda el DÍA ENTERO, no solo a la persona que sobra: al quitarle su parte,
 * los porcentajes del día ya no suman 100 y repartir su hueco entre los demás
 * sería inventar un reparto que nadie eligió. Sin porcentajes guardados, el día
 * vuelve al reparto automático, que es un punto de partida honesto.
 */
export function podarPorcentajesCaducados(
  percentages: Record<string, Record<string, number>> | undefined,
  people: FairQuotaPerson[],
  presence: Record<string, string[]>
): PodaDePorcentajes {
  if (!percentages) return { percentages: {}, avisos: [] };

  const nombres = new Map(people.map((person) => [person.userId, person.name]));
  const limpios: Record<string, Record<string, number>> = {};
  const avisos: string[] = [];

  for (const [date, manual] of Object.entries(percentages)) {
    const present = new Set(presence[date] ?? []);
    const sobran = Object.entries(manual)
      .filter(([userId, value]) => value > 0 && !present.has(userId))
      .map(([userId]) => nombres.get(userId) ?? userId);

    if (sobran.length === 0) {
      limpios[date] = manual;
      continue;
    }
    avisos.push(
      `El ${date} se recalculó solo: ${sobran.join(" y ")} ya no labora${sobran.length > 1 ? "n" : ""} ese día. Revísalo antes de guardar.`
    );
  }

  return { percentages: limpios, avisos };
}

function validateManualPercentages(
  date: string,
  people: FairQuotaPerson[],
  present: Set<string>,
  manual: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const person of people) {
    const value = finiteBetween(manual[person.userId] ?? 0, 0, 100, `porcentaje de ${person.name} el ${date}`);
    if (!present.has(person.userId) && value > 0) {
      throw new Error(`${person.name} no labora el ${date} y no puede recibir porcentaje.`);
    }
    result[person.userId] = value;
  }
  const total = sum(Object.values(result));
  if (Math.abs(total - 100) > 0.01 && present.size > 0) {
    throw new Error(`Los porcentajes del ${date} suman ${roundPercent(total)} %, deben sumar 100 %.`);
  }
  normalizePercentages(result, people.filter((person) => present.has(person.userId)).map((person) => person.userId));
  return result;
}

function normalizePercentages(values: Record<string, number>, recipients: string[]) {
  if (recipients.length === 0) return;
  for (const id of recipients) values[id] = roundPercent(values[id] ?? 0);
  const residue = roundPercent(100 - sum(recipients.map((id) => values[id] ?? 0)));
  const last = recipients[recipients.length - 1];
  values[last] = roundPercent((values[last] ?? 0) + residue);
}

function allocateMoney(total: number, people: FairQuotaPerson[], percentages: Record<string, number>) {
  const result = Object.fromEntries(people.map((person) => [person.userId, 0]));
  const recipients = people.filter((person) => (percentages[person.userId] ?? 0) > 0);
  let assigned = 0;
  recipients.forEach((person, index) => {
    const value = index === recipients.length - 1
      ? roundMoney(total - assigned)
      : roundMoney(total * (percentages[person.userId] / 100));
    result[person.userId] = value;
    assigned = roundMoney(assigned + value);
  });
  return result;
}

function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`El ${label} no es válido.`);
  return value;
}
function finiteBetween(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`El ${label} no es válido.`);
  return value;
}
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function roundPercent(value: number) { return Math.round((value + Number.EPSILON) * 10_000) / 10_000; }
