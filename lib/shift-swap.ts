/**
 * Intercambio de descansos entre dos asesores.
 *
 * Hoy esto vive en WhatsApp y en la memoria de gerencia. De ahí salió un bug real
 * (se editó el Drive a mano y el ranking mostraba a los dos laborando el mismo
 * día). Con esto queda registrado quién propuso, quién aceptó y quién autorizó.
 *
 * CAMINO A — la app COORDINA, no manda:
 * El archivo de Horarios sigue siendo la fuente de verdad. La app no escribe el
 * horario; al aprobarse, le dice a gerencia exactamente qué cambiar en el Drive
 * y luego detecta sola cuándo ya quedó.
 *
 * Se eligió así a propósito: si la app sobrescribiera el horario, habría DOS
 * fuentes de verdad contradiciéndose — que es justo la clase de bug que se
 * arregló en el ranking.
 */

export type SwapStatus =
  | "PENDIENTE_COMPANERO"  // esperando que el compañero acepte
  | "RECHAZADO_COMPANERO"  // el compañero dijo que no
  | "PENDIENTE_GERENCIA"   // aceptado; falta autorización
  | "APROBADO"
  | "RECHAZADO";           // gerencia lo negó

export const SWAP_STATUS_LABEL: Record<SwapStatus, string> = {
  PENDIENTE_COMPANERO: "Esperando a tu compañero",
  RECHAZADO_COMPANERO: "Tu compañero no aceptó",
  PENDIENTE_GERENCIA: "Esperando autorización",
  APROBADO: "Aprobado",
  RECHAZADO: "No autorizado"
};

export const SWAP_STATUS_TONE: Record<SwapStatus, string> = {
  PENDIENTE_COMPANERO: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  RECHAZADO_COMPANERO: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  PENDIENTE_GERENCIA: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  APROBADO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  RECHAZADO: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
};

export type SwapProposal = {
  requesterId: string;
  /** Día que HOY descansa el proponente y cede. "YYYY-MM-DD" */
  requesterDate: string;
  targetId: string;
  /** Día que HOY descansa el compañero y cede. */
  targetDate: string;
};

/** Estatus del horario de un día, para validar la propuesta. */
export type ScheduleLookup = (userId: string, date: string) => string | null;

export type ValidationError = string | null;

/**
 * Valida la propuesta ANTES de crearla.
 *
 * Lo importante: se comprueba contra el HORARIO real que cada quien descansa el
 * día que ofrece. Sin esto, alguien podría "cambiar" un descanso que no tiene, y
 * gerencia se enteraría hasta el final.
 */
export function validateProposal(
  proposal: SwapProposal,
  scheduleOf: ScheduleLookup,
  today: string
): ValidationError {
  if (proposal.requesterId === proposal.targetId) {
    return "No puedes intercambiar contigo mismo.";
  }
  if (proposal.requesterDate <= today || proposal.targetDate <= today) {
    // Cambiar un día que ya pasó no tiene sentido: ya se trabajó o se descansó.
    return "Solo puedes intercambiar días futuros.";
  }
  if (proposal.requesterDate === proposal.targetDate) {
    return "Los dos días son el mismo: no hay nada que intercambiar.";
  }

  const mine = scheduleOf(proposal.requesterId, proposal.requesterDate);
  if (mine !== "OFF") {
    return "El día que ofreces no es tu descanso.";
  }
  const theirs = scheduleOf(proposal.targetId, proposal.targetDate);
  if (theirs !== "OFF") {
    return "El día que pides no es el descanso de tu compañero.";
  }
  return null;
}

/** ¿Puede este usuario responder (aceptar/rechazar) la propuesta? */
export function canRespond(swap: { targetId: string; status: string }, userId: string): boolean {
  return swap.status === "PENDIENTE_COMPANERO" && swap.targetId === userId;
}

/** ¿Puede gerencia autorizarla? */
export function canApprove(swap: { status: string }): boolean {
  return swap.status === "PENDIENTE_GERENCIA";
}

/**
 * Lo que gerencia tiene que cambiar en el Drive, ya masticado.
 *
 * Se intercambian los descansos: cada uno pasa a descansar el día del otro.
 */
export function driveInstructions(swap: {
  requesterName: string;
  requesterDate: string;
  targetName: string;
  targetDate: string;
}): string[] {
  return [
    `${swap.requesterName}: ${swap.requesterDate} pasa a LABORANDO, y ${swap.targetDate} a DESCANSO.`,
    `${swap.targetName}: ${swap.targetDate} pasa a LABORANDO, y ${swap.requesterDate} a DESCANSO.`
  ];
}

/**
 * ¿El horario ya refleja el intercambio aprobado?
 *
 * Se usa tras sincronizar Horarios para marcar `driveUpdated` solo. Así el
 * recordatorio a gerencia desaparece cuando de verdad quedó, sin que nadie tenga
 * que acordarse de marcarlo como hecho.
 */
export function isReflectedInSchedule(
  swap: SwapProposal,
  scheduleOf: ScheduleLookup
): boolean {
  return (
    scheduleOf(swap.requesterId, swap.requesterDate) === "WORKING" &&
    scheduleOf(swap.requesterId, swap.targetDate) === "OFF" &&
    scheduleOf(swap.targetId, swap.targetDate) === "WORKING" &&
    scheduleOf(swap.targetId, swap.requesterDate) === "OFF"
  );
}
