// Lógica de suscripción SaaS (sin dependencias de red ni Prisma, para poder
// probarla). El precio y las fechas se calculan aquí; el estado de acceso lo
// resuelve el paywall existente (lib/session.ts) leyendo subscriptionPaidUntil.

// Precio por USUARIO ACTIVO al mes (MXN, IVA incluido). La mensualidad de cada
// tienda se calcula: usuarios activos × precio por usuario.
export const DEFAULT_PRICE_PER_USER_MXN = 80;

/** Precio por usuario efectivo de una tienda (el propio o el default). */
export function pricePerUser(storePricePerUserMxn: number | null | undefined): number {
  return storePricePerUserMxn && storePricePerUserMxn > 0 ? storePricePerUserMxn : DEFAULT_PRICE_PER_USER_MXN;
}

/** Mensualidad de la tienda = usuarios activos × precio por usuario. */
export function monthlyAmount(activeUsers: number, storePricePerUserMxn: number | null | undefined): number {
  const users = Math.max(1, Math.trunc(activeUsers)); // mínimo se cobra 1 (el gerente)
  return Math.round(users * pricePerUser(storePricePerUserMxn) * 100) / 100;
}

/**
 * Nueva fecha "pagado hasta" al acreditar un pago. Si la suscripción sigue
 * vigente, el mes se acumula sobre la fecha actual (pago anticipado); si ya
 * venció (o nunca pagó), arranca desde hoy. Suma meses de calendario.
 */
export function extendSubscription(current: Date | null | undefined, now: Date, months = 1): Date {
  const base = current && current.getTime() > now.getTime() ? new Date(current) : new Date(now);
  const result = new Date(base);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export type SubscriptionState = "exenta" | "activa" | "por_vencer" | "vencida" | "sin_pago";

/** Estado legible de la suscripción para la pantalla del gerente. */
export function subscriptionState(input: {
  billingExempt: boolean;
  subscriptionPaidUntil: Date | null;
  now?: Date;
}): { state: SubscriptionState; daysLeft: number | null } {
  const now = input.now ?? new Date();
  if (input.billingExempt) return { state: "exenta", daysLeft: null };
  if (!input.subscriptionPaidUntil) return { state: "sin_pago", daysLeft: null };
  const ms = input.subscriptionPaidUntil.getTime() - now.getTime();
  const daysLeft = Math.ceil(ms / 86_400_000);
  if (daysLeft < 0) return { state: "vencida", daysLeft };
  if (daysLeft <= 5) return { state: "por_vencer", daysLeft };
  return { state: "activa", daysLeft };
}
