/**
 * Reconocimientos de Tailored Help: qué toca reconocer. Sin Prisma a propósito,
 * para poder probarlo; quien consulta y manda es `lib/reconocimientos-envio.ts`.
 *
 * Los tres que pidió Adrián:
 *
 * - **primero**: el primer donativo de la campaña en la tienda. Una sola vez.
 * - **dia**: alguien junta $150 o más en un día. Una vez por persona y día.
 * - **mvp**: quien más juntó en la semana retail ANTERIOR (domingo a sábado).
 *   Un empate reconoce a todos los empatados: elegir a uno sería injusto.
 *
 * ⚠️ Cada reconocimiento lleva una CLAVE y se manda una sola vez. Corregir un
 * monto después no lo repite --la persona ya fue felicitada--, y guardarlo dos
 * veces tampoco.
 */

export const UMBRAL_DIA = 150;
/** Un «gran día» viejo ya no se celebra: con más días se felicitaría tarde. */
export const DIAS_ATRAS_DIA = 3;
const DIA_MS = 86_400_000;

export type AporteReco = { userId: string; nombre: string; fecha: string; monto: number; donativos: number; creado: Date };

export type Reconocimiento = {
  clave: string;
  tipo: "primero" | "dia" | "mvp";
  userId: string;
  nombre: string;
  monto: number;
  donativos: number;
  /** El día (primero/dia) o el domingo de la semana (mvp), AAAA-MM-DD. */
  fecha: string;
};

const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** Domingo de la semana retail del día dado. */
export function domingoDe(fecha: string): string {
  return sumarDias(fecha, -new Date(`${fecha}T00:00:00Z`).getUTCDay());
}

export function pendientes(opciones: {
  aportes: AporteReco[];
  /** Hoy en Monterrey, AAAA-MM-DD. */
  hoy: string;
  /** Claves ya mandadas. */
  ya: Set<string>;
}): Reconocimiento[] {
  const { hoy, ya } = opciones;
  const aportes = opciones.aportes.filter((a) => a.monto > 0 && a.fecha <= hoy);
  const salida: Reconocimiento[] = [];
  const empujar = (r: Reconocimiento) => {
    if (!ya.has(r.clave)) salida.push(r);
  };

  // ── primero ──────────────────────────────────────────────────────────────
  const primero = [...aportes].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.getTime() - b.creado.getTime())[0];
  if (primero) {
    empujar({ clave: "primero", tipo: "primero", userId: primero.userId, nombre: primero.nombre, monto: primero.monto, donativos: primero.donativos, fecha: primero.fecha });
  }

  // ── gran día ─────────────────────────────────────────────────────────────
  const desde = sumarDias(hoy, -DIAS_ATRAS_DIA);
  for (const a of aportes) {
    if (a.monto >= UMBRAL_DIA && a.fecha >= desde) {
      empujar({ clave: `dia:${a.fecha}:${a.userId}`, tipo: "dia", userId: a.userId, nombre: a.nombre, monto: a.monto, donativos: a.donativos, fecha: a.fecha });
    }
  }

  // ── MVP de la semana pasada ──────────────────────────────────────────────
  // Solo la INMEDIATA anterior: una semana más vieja ya no tiene caso.
  const domingoPasado = sumarDias(domingoDe(hoy), -7);
  const sabadoPasado = sumarDias(domingoPasado, 6);
  const porPersona = new Map<string, { nombre: string; total: number; donativos: number }>();
  for (const a of aportes) {
    if (a.fecha < domingoPasado || a.fecha > sabadoPasado) continue;
    const p = porPersona.get(a.userId) ?? { nombre: a.nombre, total: 0, donativos: 0 };
    p.total += a.monto;
    p.donativos += a.donativos;
    porPersona.set(a.userId, p);
  }
  const mejor = Math.max(0, ...[...porPersona.values()].map((p) => p.total));
  if (mejor > 0) {
    for (const [userId, p] of porPersona) {
      if (Math.abs(p.total - mejor) < 0.005) {
        empujar({ clave: `mvp:${domingoPasado}:${userId}`, tipo: "mvp", userId, nombre: p.nombre, monto: p.total, donativos: p.donativos, fecha: domingoPasado });
      }
    }
  }
  return salida;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «Sábado 7 de noviembre». */
export function fechaLarga(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
