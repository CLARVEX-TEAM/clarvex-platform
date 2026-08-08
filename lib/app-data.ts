import type { CommissionBasis } from "@/lib/commission";
import type { DashboardDailyKpi } from "@/lib/dashboard-kpi";
import type { Announcement, CommissionRule, DayPlan, Evidence, Kpi, LogEntry, Pending, ScheduleShift, User } from "@/lib/types";

export type AppData = {
  users: User[];
  kpis: Kpi[];
  dashboardDaily: DashboardDailyKpi;
  plans: DayPlan[];
  pendings: Pending[];
  logEntries: LogEntry[];
  announcements: Announcement[];
  schedules: ScheduleShift[];
  evidences: Evidence[];
  commissionRules: CommissionRule[];
  /** Contra qué se mide el alcance de comisión: el mínimo o la meta (GUESS). */
  commissionBasis: CommissionBasis;
};

/**
 * Caché en memoria del panel, para que cambiar de pantalla no vacíe la vista.
 *
 * Cada pantalla pedía `/api/app-data` al montarse y mostraba esqueletos hasta
 * que respondía. Como la respuesta trae el conjunto entero de la tienda —más de
 * mil horarios en la más cargada—, el hueco duraba segundos por datos móviles y
 * se veía como un corte al navegar.
 *
 * Ventana corta a propósito: los treinta segundos cubren el ir y venir entre
 * pestañas, que es donde molesta, y dejan pasar de largo tanto el refresco
 * automático de cinco minutos como el de volver a la app, que deben traer datos
 * frescos de verdad.
 */
const CACHE_MS = 30_000;

type CacheEntry = { data: AppData; at: number };
const cache = new Map<string, CacheEntry>();

// La clave separa las variantes: `includeInactive` devuelve TAMBIÉN a la gente
// dada de baja. Compartir entrada colaría bajas en las pantallas que solo deben
// ver gente activa, o al revés.
const cacheKey = (options?: { includeInactive?: boolean }) => (options?.includeInactive ? "all" : "active");

/**
 * Vacía la caché. Obligatorio al cerrar sesión: el celular kiosko y las cuentas
 * demo son COMPARTIDOS, así que dejarla viva le enseñaría a la siguiente persona
 * los datos de la anterior.
 */
export function clearAppDataCache() {
  cache.clear();
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Reintenta con timeout: en iOS (PWA) Safari a veces aborta la petición al cambiar
// de pantalla, lo que dejaba la vista pegada en el esqueleto. Aquí se recupera sola.
export async function fetchAppData(options?: { includeInactive?: boolean }): Promise<AppData> {
  const key = cacheKey(options);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const url = options?.includeInactive ? "/api/app-data?includeInactive=1" : "/api/app-data";
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, 12000);
      if (response.status === 401) {
        // Sesión caducada o inválida: al login. No es un error de "conexión" ni
        // algo que reintentar — mostrarlo así hacía parecer una caída del servidor
        // cuando en realidad solo hay que volver a iniciar sesión.
        // Se vacía la caché antes de salir: quien entre después no debe heredar
        // los datos de la sesión que acaba de caducar.
        clearAppDataCache();
        window.location.href = "/login";
        throw new Error("Sesión expirada.");
      }
      if (response.status === 402) {
        // Suscripción de la tienda vencida: pantalla de suspensión.
        window.location.href = "/suspendida";
        throw new Error("Suscripción vencida.");
      }
      if (!response.ok) throw new Error("No se pudieron cargar los datos del panel.");
      const data = await response.json() as AppData;
      cache.set(key, { data, at: Date.now() });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudieron cargar los datos del panel.");
}
